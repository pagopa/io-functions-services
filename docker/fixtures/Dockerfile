FROM node:16-alpine

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN yarn install --frozen-lockfile

CMD ["node", "index.js"]
