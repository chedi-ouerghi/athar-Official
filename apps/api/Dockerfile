# Image de l'API Athar (monorepo pnpm). Build depuis la RACINE du repo :
#   docker build -f apps/api/Dockerfile -t athar-api .
# Seuls apps/api et ses dépendances workspace (@athar/contracts) sont installés ;
# le mobile et l'admin sont ignorés grâce au --filter (et au .dockerignore).

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@athar/api..."
# Sélecteur par NOM : "..." construit d'abord @athar/contracts, puis l'API (tsc -> apps/api/dist).
# Le sélecteur par chemin ("./apps/api...") ne remonte pas aux dépendances : contracts non construit.
RUN pnpm --filter "@athar/api..." build
# Retire les devDependencies une fois le build fait
RUN pnpm install --frozen-lockfile --prod --filter "@athar/api..."

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
# Les fichiers JSON de l'API vivent dans /data (volume ; voir deploy/docker-compose.yml)
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
