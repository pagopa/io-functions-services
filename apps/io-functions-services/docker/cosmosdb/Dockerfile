FROM node:14.16.0@sha256:f6b9ff4caca9d4f0a331a882e560df242eb332b7bbbed2f426784de208fcd7bd

WORKDIR /opt/cosmosdb

RUN npm install -g @zeit/cosmosdb-server

CMD ["sh", "-c", "cosmosdb-server -p 3000"]
