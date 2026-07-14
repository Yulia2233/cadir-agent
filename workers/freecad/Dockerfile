FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY workers/freecad/pyproject.toml ./
COPY workers/freecad/src ./src
RUN python -m pip wheel --wheel-dir /wheels --no-deps .

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONNOUSERSITE=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libx11-6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10003 cad-freecad \
    && useradd --uid 10003 --gid cad-freecad --no-create-home --shell /usr/sbin/nologin cad-freecad
COPY vendor/simplecadapi-v2.0.1b1.tar /tmp/simplecadapi.tar
COPY --from=build /wheels /wheels
COPY services/runner/constraints.txt /tmp/constraints.txt
RUN python -m pip install --constraint /tmp/constraints.txt /wheels/*.whl /tmp/simplecadapi.tar \
    && python -c "from importlib.metadata import version; assert version('simplecadapi') == '2.0.1b1'" \
    && rm -rf /wheels /tmp/simplecadapi.tar /tmp/constraints.txt
WORKDIR /srv
USER 10003:10003
EXPOSE 8095
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8095/health/ready', timeout=2)"]
CMD ["uvicorn", "cadir_freecad.app:app", "--host", "0.0.0.0", "--port", "8095", "--no-access-log"]
