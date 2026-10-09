import type {
  CampoLoginResponse,
  CampoMeResponse,
  CheckinPayload,
  JourneyView,
  PlaceView,
  Posicao,
  TodayView,
  VisitAnswers,
  VisitView,
} from '../domain/campo.types';
import { campoApi } from './campo-http';

export async function campoLogin(email: string, password: string): Promise<CampoLoginResponse> {
  const { data } = await campoApi.post('/v1/campo/auth/login', { email, password });
  return data as CampoLoginResponse;
}

export async function campoTrocarSenha(atual: string, nova: string): Promise<CampoLoginResponse> {
  const { data } = await campoApi.post('/v1/campo/auth/change-password', {
    current_password: atual,
    new_password: nova,
  });
  return data as CampoLoginResponse;
}

export async function campoMe(): Promise<CampoMeResponse> {
  const { data } = await campoApi.get('/v1/campo/me');
  return data as CampoMeResponse;
}

export async function campoHoje(): Promise<TodayView> {
  const { data } = await campoApi.get('/v1/campo/today');
  return data as TodayView;
}

export async function campoIniciarJornada(p: { client_id: string } & Posicao): Promise<JourneyView> {
  const { data } = await campoApi.post('/v1/campo/journeys/start', p);
  return data as JourneyView;
}

export async function campoEnviarPontos(
  points: ({ client_id: string } & Posicao)[],
): Promise<{ accepted: number; duplicates: number }> {
  const { data } = await campoApi.post('/v1/campo/journeys/current/points', { points });
  return data as { accepted: number; duplicates: number };
}

export async function campoEncerrarJornada(p: Posicao): Promise<JourneyView> {
  const { data } = await campoApi.post('/v1/campo/journeys/current/end', p);
  return data as JourneyView;
}

export async function campoLugaresPerto(lat: number, lng: number): Promise<PlaceView[]> {
  const { data } = await campoApi.get('/v1/campo/places', { params: { lat, lng } });
  return data as PlaceView[];
}

export async function campoBuscarLugares(q: string): Promise<PlaceView[]> {
  const { data } = await campoApi.get('/v1/campo/places', { params: { q } });
  return data as PlaceView[];
}

export async function campoLugaresParecidos(name: string, lat: number, lng: number): Promise<PlaceView[]> {
  const { data } = await campoApi.get('/v1/campo/places/similar', { params: { name, lat, lng } });
  return data as PlaceView[];
}

/** Multipart: campos + foto. `place_name` é só da tela e não vai. Foto em rede ruim: 2 min de prazo. */
export async function campoCheckin(p: CheckinPayload, foto: Blob): Promise<VisitView> {
  const form = new FormData();
  form.append('client_id', p.client_id);
  form.append('at', p.at);
  form.append('lat', String(p.lat));
  form.append('lng', String(p.lng));
  form.append('accuracy', String(p.accuracy));
  if (p.lead_id) form.append('lead_id', p.lead_id);
  if (p.new_place) form.append('new_place', JSON.stringify(p.new_place));
  if (p.confirm_new !== undefined) form.append('confirm_new', String(p.confirm_new));
  form.append('photo', foto, 'fachada.jpg');
  const { data } = await campoApi.post('/v1/campo/visits', form, { timeout: 120_000 });
  return data as VisitView;
}

export async function campoSalvarRespostas(ref: string, respostas: VisitAnswers): Promise<VisitView> {
  const { data } = await campoApi.patch(`/v1/campo/visits/${ref}/answers`, respostas);
  return data as VisitView;
}

export async function campoCheckout(ref: string, p: Posicao): Promise<VisitView> {
  const { data } = await campoApi.post(`/v1/campo/visits/${ref}/checkout`, p);
  return data as VisitView;
}

/** `GET /v1/campo/visits/:ref/photo` — só das visitas do próprio consultor (§20.3). */
export async function campoFotoVisita(ref: string): Promise<Blob> {
  const { data } = await campoApi.get(`/v1/campo/visits/${encodeURIComponent(ref)}/photo`, { responseType: 'blob' });
  return data as Blob;
}
