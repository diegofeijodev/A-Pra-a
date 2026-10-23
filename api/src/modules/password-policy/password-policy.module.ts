import { Global, Module } from '@nestjs/common';
import { PasswordPolicyController } from './password-policy.controller';
import { PasswordPolicyService } from './password-policy.service';

/** Global: a regra vale na troca de senha do consultor (campo) e nas senhas da equipe (pessoas). */
@Global()
@Module({ controllers: [PasswordPolicyController], providers: [PasswordPolicyService], exports: [PasswordPolicyService] })
export class PasswordPolicyModule {}
