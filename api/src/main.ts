import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { validateEnv } from './common/config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { flattenErrors } from './common/validation/flatten-errors';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // O adaptador do Fastify é construído ANTES de o `ConfigService` existir, e
  // `trustProxy` é opção de construção. O `.env` já está em `process.env` neste
  // ponto (o `ConfigModule.forRoot()` do `AppModule` carrega o arquivo quando o
  // módulo é avaliado, no `import` acima), então vale o mesmo schema do resto.
  const env = validateEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: { timestamp: () => `,"time":"${new Date().toISOString()}"` },
      // Importações de planilha chegam no body (até 5.000 linhas).
      bodyLimit: 8 * 1024 * 1024,
      // Sem isto, `req.ip` é o IP do socket: atrás de nginx TODO visitante vira
      // um IP só e o teto por IP (300/min por rota, 10/min no formulário
      // público) passa a valer para o mundo inteiro junto. Ver README, "Produção".
      trustProxy: env.TRUST_PROXY,
    }),
  );

  await app.register(helmet as never, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https:`, `'unsafe-inline'`],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Multipart: o repasse da imagem das campanhas automáticas do Freela
  // (`POST /v1/freela/templates/upload`) e a foto da fachada no check-in do
  // consultor de campo (`POST /v1/campo/visits`). 5 MB, um arquivo — o arquivo
  // grande morre aqui, com 413, e não depois de atravessar a rede.
  await app.register(multipart as never, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  const config = app.get(ConfigService);

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Em payload aninhado (ex.: `contacts[]` de disparo), as constraints ficam
      // nos FILHOS — ler só o nível de cima devolve mensagem vazia.
      exceptionFactory: (errors) =>
        new BadRequestException({ code: 'VALIDATION_ERROR', message: flattenErrors(errors) }),
    }),
  );

  const allowedOrigins = config.get<string>('CORS_ORIGINS')?.split(',').filter(Boolean) ?? [];
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const nodeEnv = config.get<string>('NODE_ENV');
  if (nodeEnv !== 'production' || config.get<string>('SWAGGER_ENABLED') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PRAÇA — API')
      .setDescription(
        'Checklist de abertura de praças, funil de contratantes, mensagens, campanhas e integração com o Freela. Contrato em docs/api-contract.md.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    SwaggerModule.setup('docs', app as never, SwaggerModule.createDocument(app as never, swaggerConfig), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('PORT') ?? 3014;
  await app.listen(port, '0.0.0.0');

  logger.log(`📍 PRAÇA API: http://localhost:${port}`);
  if (nodeEnv !== 'production') logger.log(`📄 Swagger UI: http://localhost:${port}/docs`);
}

void bootstrap();
