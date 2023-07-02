FROM node:18.16.1

RUN apt-get update
RUN apt-get install -y ffmpeg

RUN mkdir /data
WORKDIR /data

COPY . /data/

RUN yarn install
RUN ./download-ggml-model.sh base.en

RUN yarn build

CMD ["yarn", "start"]