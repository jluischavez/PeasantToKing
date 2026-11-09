import type { RoyalEvent } from '../simulation/Crown';

export const royalDecree = {
  title: 'El primer decreto real',
  text: 'Por orden de Su Majestad, la Corona ha abierto un registro de tributos para tu asentamiento. Dispones de tres días para pagar cada obligación desde que se anuncia. Si dejas vencer tres tributos seguidos, perderás el cargo. El escribano ya ha preparado tres plumas. Por desgracia, su presupuesto también sale del tributo.',
};

export const royalDefeat = {
  title: 'Capítulo final — El rey ya no os quiere',
  final: true,
  text: [
    'Y así terminó la historia de aquel humilde campesino que soñaba con convertirse en rey.',
    'Durante un tiempo gobernó tierras, levantó edificios y administró las riquezas de sus habitantes. Sin embargo, hubo algo que jamás consiguió conservar: la confianza de Su Majestad.',
    'Cansado de sus constantes decepciones, el monarca firmó finalmente el decreto que lo despojaba de todos sus títulos. Sus tierras fueron confiscadas, su autoridad desapareció y sus antiguos súbditos tuvieron que acostumbrarse a un nuevo gobernador.',
    'Dicen que el exgobernante fue visto por última vez caminando hacia una taberna, asegurando que todo había sido un malentendido. Y así concluye vuestra historia... por ahora.',
    'DERROTA — HAS SIDO DESTITUIDO POR EL REY',
  ].join('\n\n'),
};

export const royalLastWarning = {
  title: 'La última advertencia del rey',
  text: '¡Por orden de Su Majestad! Los informes sobre vuestra administración han agotado la paciencia real, esa reserva que hasta ayer parecía mayor que sus gastos. El rey ha perdido toda confianza en vos. Disponéis de 24 horas del juego desde la pérdida de favor para recuperar su confianza. Ofreced una ofrenda o pagad un tributo pendiente antes de su vencimiento para elevar el favor por encima de cero. Si fracasáis, vuestras tierras y vuestro título serán confiscados. El escribano ya ha reservado la carreta para llevarse el sello.',
};

export function royalMessage(event: RoyalEvent): string {
  if (event.kind === 'mission') return 'La Corona ha anotado vuestra decisión en las crónicas del reino.';
  if (event.kind === 'confidence-lost') return 'Favor real en cero. Dispones de 24 horas del juego para recuperar la confianza del rey.';
  if (event.kind === 'confidence-restored') return 'Has recuperado la confianza del rey. Se cancela la cuenta regresiva de destitución.';
  if (event.kind === 'paid') return 'La Corona acusa recibo del tributo. El rey agradece tu puntualidad.';
  if (event.kind === 'offering') return 'El rey acepta tu ofrenda y te envía sus saludos.';
  if (event.streak === 1) return 'Primer impago. El rey exige mayor disciplina con los tributos.';
  if (event.streak === 2) return 'Segundo impago consecutivo. La Corona te destituirá si vence el siguiente tributo.';
  return 'Tercer impago consecutivo. La Corona te ha destituido.';
}
