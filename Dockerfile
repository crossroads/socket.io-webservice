FROM node:boron-alpine

RUN \
  apk update && \
  apk upgrade && \
  mkdir /app && \
  chown 1000:1000 /app

USER 1000:1000

COPY . /app

WORKDIR /app

RUN yarn install

ENTRYPOINT npm start
