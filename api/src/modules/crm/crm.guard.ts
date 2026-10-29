import { CanActivate, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CRM_DESLIGADAS, CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';

/*
 * CRM automático (contrato §47.3): `CRM_TASKS_ENABLED` desligada = 404 em todas as rotas `/v1/crm`. O guard global (sessão) roda
 * antes: token de consultor numa rota da equipe continua `401`. Sem o provedor (teste montado à mão) vale "desligada".
 */
@Injectable()
export class CrmLigadoGuard implements CanActivate {
  constructor(@Optional() @Inject(CRM_FLAGS) private readonly flags: FlagsCrm = CRM_DESLIGADAS) {}
  canActivate(): boolean {
    if (!this.flags.tasks) throw new NotFoundException({ code: 'CRM_TASKS_DISABLED', message: 'As tarefas do Comercial não estão habilitadas neste servidor.' });
    return true;
  }
}
