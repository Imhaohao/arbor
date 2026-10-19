FROM gcc:14
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY judge.py /opt/judge.py
WORKDIR /work
