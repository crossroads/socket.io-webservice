# docker build -t sio:latest .
# docker run -i -t sio:latest /bin/bash

FROM node:16-bookworm-slim

RUN apt-get -y update && \
  mkdir -p /app

COPY . /app
WORKDIR /app
RUN yarn install
EXPOSE 80
ENTRYPOINT yarn start