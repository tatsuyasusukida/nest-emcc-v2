FROM gcr.io/buildpacks/google-22/run AS builder
USER root
RUN apt-get update
RUN apt-get install -y git
RUN apt-get install -y python3
RUN apt-get install -y xz-utils
RUN apt-get install -y lbzip2
USER cnb
WORKDIR /home/cnb
RUN git clone https://github.com/emscripten-core/emsdk.git
RUN emsdk/emsdk install latest
RUN emsdk/emsdk activate latest

FROM gcr.io/buildpacks/google-22/run
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
USER cnb
COPY --from=builder /home/cnb/emsdk/.emscripten /home/cnb/emsdk/.emscripten
COPY --from=builder /home/cnb/emsdk/node /home/cnb/emsdk/node
COPY --from=builder /home/cnb/emsdk/upstream /home/cnb/emsdk/upstream
ENV PATH $PATH:/home/cnb/emsdk/upstream/emscripten
