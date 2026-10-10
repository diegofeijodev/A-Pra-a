FROM node:22-alpine
# openssl: o engine do Prisma 5 no Alpine não detecta a libssl sem ele (migrate deploy morre no boot).
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Teto de heap no build: no EC2 (dividido com o Freela) o tsc falha com mensagem clara em vez de empurrar a máquina para o swap.
RUN npx prisma generate && NODE_OPTIONS=--max-old-space-size=1536 npm run build
EXPOSE 3014
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
