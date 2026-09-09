import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// @Global(): o JwtAuthGuard (APP_GUARD) e o UsersModule precisam do JwtService
// e do AuthService (para reaproveitar `toUserView`) sem reimportar o módulo
// inteiro em cada lugar.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // `expiresIn` do jsonwebtoken é template literal type ("12h"); o valor
        // vem do .env como string comum, daí o cast.
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '12h') as `${number}h` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
