FROM oven/bun:1.3.11-alpine AS source-build
WORKDIR /src
RUN apk add --no-cache git
COPY vendor/opencode/ ./
COPY packages/opencode-cadir/runtime/cadir-plugin.ts /src/cadir-plugin.ts
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --ignore-scripts
RUN OPENCODE_VERSION=1.4.9 OPENCODE_CHANNEL=latest bun run --cwd packages/opencode script/build.ts --single --baseline --skip-install --skip-embed-web-ui \
    && cp /src/packages/opencode/dist/opencode-linux-$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')-baseline/bin/opencode /opencode \
    && bun build /src/cadir-plugin.ts --target=bun --outfile=/cadir-plugin.js

FROM alpine:3.22.1@sha256:4bcff63911fcb4448bd4fdacec207030997caf25e9bea4045fa6c8c44de311d1
RUN apk add --no-cache ca-certificates libgcc libstdc++ nodejs ripgrep \
    && addgroup -g 10004 -S opencode \
    && adduser -u 10004 -S -D -H -G opencode opencode \
    && mkdir -p /opt/cadir /var/lib/opencode /data/workspaces \
    && chown -R opencode:opencode /var/lib/opencode /data/workspaces
COPY --from=source-build /opencode /usr/local/bin/opencode
COPY --from=source-build /cadir-plugin.js /opt/cadir/cadir-plugin.js
COPY packages/opencode-cadir/runtime/opencode.json /opt/cadir/opencode.json
ENV HOME=/var/lib/opencode \
    OPENCODE_CONFIG=/opt/cadir/opencode.json \
    OPENCODE_DISABLE_AUTOUPDATE=true \
    OPENCODE_DISABLE_DEFAULT_PLUGINS=true \
    OPENCODE_DISABLE_EXTERNAL_SKILLS=true \
    OPENCODE_DISABLE_LSP_DOWNLOAD=true \
    OPENCODE_DISABLE_MODELS_FETCH=true \
    OPENCODE_DISABLE_EMBEDDED_WEB_UI=true
USER 10004:10004
EXPOSE 4096
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD ["node", "-e", "const u=process.env.OPENCODE_SERVER_USERNAME||'opencode';const p=process.env.OPENCODE_SERVER_PASSWORD||'';fetch('http://127.0.0.1:4096/global/health',{headers:{authorization:'Basic '+Buffer.from(u+':'+p).toString('base64')}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["opencode"]
CMD ["serve", "--hostname", "0.0.0.0", "--port", "4096"]
