FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9

WORKDIR /app
COPY server.mjs fixtures.mjs ./

ENV PORT=4000
EXPOSE 4000
USER node

CMD ["node", "server.mjs"]
