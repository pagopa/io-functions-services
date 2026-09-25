FROM mcr.microsoft.com/azure-functions/node:2.0@sha256:89037b0d166caee62139d8524776798ed5686ba9d15a57629f6799e87eae0c8c

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

COPY . /home/site/wwwroot

RUN cd /home/site/wwwroot && \
    npm install