FROM functions-node-14

COPY . /usr/src/app

RUN func extensions install

RUN yarn install --frozen-lockfile
RUN yarn build

CMD ["func", "start", "--javascript"]
