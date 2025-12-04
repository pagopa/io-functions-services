FROM node:14

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN yarn install --frozen-lockfile
RUN yarn build

CMD ["node", "dist/index.js"]
