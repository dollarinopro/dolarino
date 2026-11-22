FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY lib ./lib
EXPOSE 8787
ENV PORT=8787
CMD ["node", "server.mjs"]
