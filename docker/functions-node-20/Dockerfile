FROM node:20.17.0

WORKDIR /usr/src/app

RUN apt-get update
RUN apt-get --no-install-recommends install -y lsb-release
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
RUN mv microsoft.gpg /etc/apt/trusted.gpg.d/microsoft.gpg
RUN sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/debian/$(lsb_release -rs | cut -d'.' -f 1)/prod $(lsb_release -cs) main" > /etc/apt/sources.list.d/dotnetdev.list'
RUN apt-get update

RUN curl -o packages-microsoft-prod.deb https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb
RUN dpkg -i packages-microsoft-prod.deb

RUN apt-get --no-install-recommends install -y azure-functions-core-tools-4
RUN apt-get --no-install-recommends install -y apt-transport-https
RUN apt-get update
RUN apt-get --no-install-recommends install -y dotnet-sdk-6.0

ENV AzureWebJobsScriptRoot=/usr/src/app \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

RUN chown -R node: /usr/src/app
USER node

CMD ["func", "start", "--javascript"]
