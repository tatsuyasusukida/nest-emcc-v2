import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { spawn } from 'child_process';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { Request, Response } from 'express';

type SourceCode = {
  name: string;
  content: string;
};

type RequestData = {
  sourceCodes: SourceCode[];
  exportedFunctions: string[];
  knownUndefinedSymbols: string[];
};

export type ConvertToWasmValidateBody = {
  ok: boolean;
  errorMessage: string;
};

@Controller()
export class AppController {
  @Get('/api/v1/status')
  apiV1Status() {
    return { ok: true, date: new Date().toISOString() };
  }

  @Post('/api/v1/compile/validate')
  async apiV1compileValidate(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const requestData: RequestData = req.body;
    const errorMessage = await this.validateRequestBody(requestData);

    if (errorMessage) {
      res.status(400).send({ errorMessage });
      return;
    }

    const { code, stderrText, filteredStderrText } = await this.convertToWasm(
      requestData,
    );

    const ok = code === 0;

    res.status(200).send({
      ok,
      errorMessage:
        !ok && filteredStderrText === '' ? stderrText : filteredStderrText,
    });
  }

  @Post('/api/v1/compile/submit')
  async apiV1compileSubmit(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const requestData: RequestData = await req.body;
    const errorMessage = await this.validateRequestBody(requestData);

    if (errorMessage) {
      res.status(400).send({ errorMessage });
      return;
    }

    const { code, wasmBuffer } = await this.convertToWasm(requestData);

    if (code !== 0) {
      const errorMessage = `Non-zero exit code: code = ${code}`;
      res.status(400).send({ errorMessage });
      return;
    }

    res.status(200).send(wasmBuffer);
  }

  async validateRequestBody(requestData: RequestData) {
    const { sourceCodes, exportedFunctions, knownUndefinedSymbols } =
      requestData;

    if (!sourceCodes || !Array.isArray(sourceCodes)) {
      return 'Invalid sourceCodes';
    }

    for (const sourceCode of sourceCodes) {
      if (
        !sourceCode ||
        !/^[_0-9A-Za-z\.]+$/.test(sourceCode.name) ||
        typeof sourceCode.content !== 'string'
      ) {
        return `Invalid sourceCode: name = ${sourceCode.name}`;
      }
    }

    if (
      !exportedFunctions ||
      !exportedFunctions.every((fn) => /^[_0-9A-Za-z]+$/.test(fn))
    ) {
      return 'Invalid exportedFunctions';
    }

    if (
      !knownUndefinedSymbols ||
      !knownUndefinedSymbols.every((fn) => /^[_0-9A-Za-z]+$/.test(fn))
    ) {
      return 'Invalid knownUndefinedSymbols';
    }

    return null;
  }

  async convertToWasm(requestData: RequestData) {
    const { sourceCodes, exportedFunctions, knownUndefinedSymbols } =
      requestData;

    const workingDirectory = join(process.cwd(), 'tmp', '' + Date.now());

    await mkdir(workingDirectory, { recursive: true });

    try {
      for (const sourceCode of sourceCodes) {
        const sourcePath = join(workingDirectory, sourceCode.name);
        await writeFile(sourcePath, sourceCode.content);
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const outputFileName = join(workingDirectory, 'a.out');
      const code = await new Promise<number | null>((resolve, reject) => {
        const command = 'emcc';
        const args = [
          '-O2',
          '-s',
          `EXPORTED_FUNCTIONS=${exportedFunctions.join(',')}`,
          '-s',
          'ERROR_ON_UNDEFINED_SYMBOLS=0',
          '-o',
          outputFileName + '.js',
          ...sourceCodes
            .filter((sourceCode) => extname(sourceCode.name) === '.cc')
            .map((sourceCode) => sourceCode.name),
        ];

        const childProcess = spawn(command, args, {
          cwd: workingDirectory,
        });

        childProcess.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
        childProcess.stderr.on('data', (chunk) => stderrChunks.push(chunk));

        childProcess.on('error', reject);
        childProcess.on('exit', resolve);
      });

      const stdoutText = Buffer.concat(stdoutChunks).toString();
      const stderrText = Buffer.concat(stderrChunks).toString();
      const filteredStderrText = stderrText
        .split('\n')
        .filter((line) => {
          return (
            !knownUndefinedSymbols.some((symbol) => {
              return (
                line ===
                `warning: undefined symbol: ${symbol} (referenced by top-level compiled C/C++ code)`
              );
            }) &&
            !line.startsWith('emcc: warning:') &&
            !line.startsWith('emcc: error:') &&
            !line.startsWith('cache:INFO:')
          );
        })
        .join('\n');

      const wasmFilename = outputFileName + '.wasm';
      const wasmBuffer = code === 0 ? await readFile(wasmFilename) : null;

      return {
        code,
        stdoutText,
        stderrText,
        filteredStderrText,
        wasmBuffer,
      };
    } finally {
      await rm(workingDirectory, { force: true, recursive: true });
    }
  }
}
