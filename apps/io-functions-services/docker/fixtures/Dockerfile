FROM node:14@sha256:a158d3b9b4e3fa813fa6c8c590b8f0a860e015ad4e59bbce5744d2f6fd8461aa

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN yarn install --frozen-lockfile
RUN yarn build

CMD ["node", "dist/index.js"]
