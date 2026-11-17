#
# docker build --pull -t socketio:master .
# docker run -i -t socketio:master /bin/bash
# docker run -d --name socketio --restart unless-stopped -p 1337:1337 --env-file ./socketio.env.dev socketio:master
#

FROM node:22-bookworm-slim
RUN apt-get -y update && mkdir -p /app

COPY . /app
WORKDIR /app
RUN yarn install
EXPOSE 1337
ENTRYPOINT ["yarn", "start"]
