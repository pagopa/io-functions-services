FROM functions-node-14

COPY . /usr/src/app
COPY ./__integrations__/__mocks__/ /usr/src/app
COPY ./docker/functions/ /usr/src/app

RUN func extensions install

RUN yarn install --frozen-lockfile
RUN yarn build

CMD ["sh", "./start.sh"]
