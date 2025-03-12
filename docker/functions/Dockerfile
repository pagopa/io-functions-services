FROM functions-node-20

COPY . /usr/src/app
COPY ./__integrations__/__mocks__/ /usr/src/app

RUN func extensions install

RUN yarn install --frozen-lockfile
RUN yarn build

CMD ["func", "start", "--javascript"]
