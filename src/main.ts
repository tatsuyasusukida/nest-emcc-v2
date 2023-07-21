import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const allowlist = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  const app = await NestFactory.create(AppModule, {
    cors: (req, callback) => {
      const origin = allowlist.includes(req.header('Origin'));

      callback(null as any, {
        origin,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
        preflightContinue: false,
        optionsSuccessStatus: 204,
      });
    },
  });

  app.use(json({ limit: '10mb' }));
  await app.listen(process.env.PORT ?? '3000');
}

bootstrap();
