FROM emscripten/emsdk

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production
ENV PORT="3000"
ENV CORS_ORIGIN="http://example.com"
CMD [ "node", "dist/main" ]
