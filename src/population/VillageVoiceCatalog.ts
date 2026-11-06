import type { TaxPolicy } from '../economy/TaxPolicy';
import type { Need, NeedsObservation } from './HouseholdNeeds';
import type { Cell } from '../map/CellSelection';
import { beautyRules } from './ResidentialBeauty.ts';
import type { Beauty } from './ResidentialBeauty';

export type VoiceTone = 'positive' | 'negative' | 'neutral';
export type VoiceCity = Readonly<{
  unemployment: number; tax: TaxPolicy; waiting: number;
  hasMarket?: boolean; hasWarehouse?: boolean; hasRoad?: boolean;
  beautyAt?: (cell: Cell) => Beauty;
  lacksHousingBeauty?: (cell: Cell) => boolean;
}>;
type Condition = (home: NeedsObservation, city: VoiceCity) => boolean;

const shortage = (need: Need) => (home: NeedsObservation) => home.coverage[need] < 0.8 && home.current[need] < 1;
const supplied = (need: Need) => (home: NeedsObservation) => home.coverage[need] >= 0.95 && home.current[need] === 1;

const topics = {
  hungry: { tone: 'negative', matches: shortage('food') },
  thirsty: { tone: 'negative', matches: shortage('water') },
  cold: { tone: 'negative', matches: shortage('wood') },
  highTaxes: { tone: 'negative', matches: (_home, city) => city.tax === 'high' },
  unemployment: { tone: 'negative', matches: (_home, city) => city.unemployment >= 0.25 },
  fed: { tone: 'positive', matches: supplied('food') },
  watered: { tone: 'positive', matches: supplied('water') },
  warm: { tone: 'positive', matches: supplied('wood') },
  lowTaxes: { tone: 'positive', matches: (_home, city) => city.tax === 'low' },
  immigration: { tone: 'neutral', matches: (_home, city) => city.waiting > 0 },
  dailyLife: { tone: 'neutral', matches: () => true },
  market: { tone: 'neutral', matches: (_home, city) => city.hasMarket === true },
  warehouse: { tone: 'neutral', matches: (_home, city) => city.hasWarehouse === true },
  road: { tone: 'neutral', matches: (_home, city) => city.hasRoad === true },
  prosperity: { tone: 'positive', matches: (home, city) =>
    city.unemployment < 0.25 && supplied('food')(home) && supplied('water')(home) && supplied('wood')(home) },
  garden: { tone: 'positive', matches: (home, city) => !!city.beautyAt?.(home.cell).sources.garden },
  park: { tone: 'positive', matches: (home, city) => !!city.beautyAt?.(home.cell).sources.park },
  plaza: { tone: 'positive', matches: (home, city) => !!city.beautyAt?.(home.cell).sources.plaza },
  beautiful: { tone: 'positive', matches: (home, city) => (city.beautyAt?.(home.cell).score ?? 0) >= 65 },
  sparse: { tone: 'negative', matches: (home, city) => city.beautyAt?.(home.cell).score === beautyRules.base },
  urbanDecline: { tone: 'negative', matches: (home, city) => city.lacksHousingBeauty?.(home.cell) === true },
  paving: { tone: 'positive', matches: (home, city) => !!city.beautyAt?.(home.cell).sources.road },
} satisfies Record<string, { tone: VoiceTone; matches: Condition }>;

type Topic = keyof typeof topics;
type VoiceTemplate = Readonly<{ topic: Topic; tone: VoiceTone; text: string; matches: Condition }>;

function templates(topic: Topic, lines: readonly string[]): VoiceTemplate[] {
  return lines.map(text => ({ topic, text, ...topics[topic] }));
}

// Keep these first eleven indices in order for saves from before Alpha 0.1.
export const originalVoiceTemplates = [
  ...templates('hungry', ['Llevamos demasiado tiempo sin comida en casa.']),
  ...templates('thirsty', ['Otra vez falta agua. Necesitamos más aguadores.']),
  ...templates('cold', ['Nos está faltando madera en casa.']),
  ...templates('highTaxes', ['Los impuestos están por las nubes.']),
  ...templates('unemployment', ['Cuesta encontrar trabajo en la aldea.']),
  ...templates('fed', ['¡Qué gusto tener comida en casa!']),
  ...templates('watered', ['¡Los aguadores ya traen agua a nuestra casa!']),
  ...templates('warm', ['Podemos contar con la madera del mercado.']),
  ...templates('lowTaxes', ['Con estos impuestos queda más margen para vivir.']),
  ...templates('immigration', ['Hay gente esperando un solar para mudarse.']),
  ...templates('dailyLife', ['Otro día en nuestra aldea.']),
];

export const urbanVoiceTemplates = [
  ...templates('garden', ['Las flores del jardín se ven desde casa. Hasta el vecino se asoma a regarlas.']),
  ...templates('park', ['¡Tenemos un parque cerca! Ahora sí dan ganas de salir a pasear.']),
  ...templates('plaza', ['Qué bonita quedó la plaza. Hasta parece que el gobernador trabaja.']),
  ...templates('beautiful', ['Mis visitas dan una vuelta al barrio antes de tocar a la puerta.']),
  ...templates('sparse', ['Con un poco de sombra y unas flores, esta calle sería otra.']),
  ...templates('urbanDecline', ['La casa sigue en pie, pero al barrio le hace falta cariño.']),
  ...templates('paving', ['Desde que arreglaron el camino, llego a casa con menos barro en las botas.']),
];

export const newVoiceTemplates = [
  ...templates('hungry', [
    'A este paso voy a cenar el olor de la sopa.',
    'Hoy la olla hizo más ruido que mi estómago. Por poco.',
    'Partimos el último mendrugo tan fino que se veía el sol a través.',
    'La despensa está tan vacía que ya le cobro alquiler al eco.',
    'En casa queremos comida, aunque sea la receta secreta de mi suegra.',
  ]),
  ...templates('thirsty', [
    'Mi cántaro pesa menos que las promesas del gobernador.',
    'Hoy discutimos por el último trago. Ganó quien lavaba los platos.',
    '¿Habrá algún aguador que pueda hacer una vuelta más por mi casa?',
    'Lavarse con dos gotas tiene mérito. Quitarse el barro tiene más.',
    'Si alguien oye tintinear mi cubo, es porque va vacío.',
  ]),
  ...templates('cold', [
    'Si la leña sigue faltando, voy a tener que negociar con el frío.',
    'En casa disputamos cada astilla como si fuera una moneda.',
    'Esta noche la manta tendrá que trabajar el doble.',
    'Una cosa es ahorrar madera y otra sentarse a mirar la chimenea apagada.',
    'El viento entró sin llamar. Con un poco de leña al menos lo recibiríamos calientes.',
  ]),
  ...templates('highTaxes', [
    'Como suban más los impuestos, tendremos que cobrarles renta a las gallinas.',
    'Con tantos impuestos, ya sé de memoria la cara de cada moneda que se va.',
    'Si el gobernador quiere otra moneda, que venga a buscarla debajo del colchón.',
    'Entre el recaudador y yo hay una diferencia: él siempre se va contento.',
    'Dicen que hay que apretarse el cinturón. El mío ya parece cuerda de pozo.',
  ]),
  ...templates('unemployment', [
    'Me levanté temprano para buscar trabajo. Ya soy experto en levantarme temprano.',
    'Tengo manos para trabajar y tiempo de sobra para mirármelas.',
    'Si hacer fila para pedir trabajo pagara, ya tendría ahorros.',
    'Ojalá abran algún puesto. Hasta cargar troncos me parece una buena idea.',
    'El vecino dice que espere mi turno. Llevo esperando desde antes del desayuno.',
  ]),
  ...templates('fed', [
    'Hoy sí puedo invitar al vecino a cenar. Que traiga su propio cuenco.',
    'Con la despensa así da gusto oír a la familia pedir otra ración.',
    'El mejor ruido de la casa es el de todos comiendo a la vez.',
    'Sobró comida. Lo raro es que mi hermano se enteró y sigue sobrando.',
    'Hay comida para la mesa y ánimo para volver al trabajo.',
  ]),
  ...templates('watered', [
    'Con el cántaro lleno, hasta da gusto que me toque fregar.',
    'Ahora tenemos agua suficiente. A ver qué excusa pone mi hermano para no bañarse.',
    'Al aguador que hizo esta ronda le guardaría un sitio a la sombra.',
    'Ya puedo lavar la ropa y hacer sopa sin regatear cada jarra.',
    'El cubo volvió lleno y el chisme sobre el aguador volvió todavía más lleno.',
  ]),
  ...templates('warm', [
    'Por fin podemos mantener encendido el fuego mientras cenamos.',
    'Con esta leña, hoy el frío se queda al otro lado de la puerta.',
    'Hay madera en casa. Hasta el gato ha vuelto a su sitio junto al fuego.',
    'Quien apiló esta leña merece sentarse primero junto al brasero.',
    'Hoy la chimenea tiene algo mejor que contar que sus penas.',
  ]),
  ...templates('lowTaxes', [
    'Con los impuestos bajos, esta vez sí quedó algo para la hucha.',
    'El gobernador nos ha dejado respirar un poco. También a nuestras bolsas.',
    'Pagué los impuestos y todavía me quedan monedas que contar.',
    'Mi vecino quiere brindar por los impuestos bajos. Eso sí, que pague yo.',
    'Si seguimos así, hasta podré arreglar la mesa sin pedir prestado.',
  ]),
  ...templates('immigration', [
    'Dicen que hay gente esperando sitio. Espero que alguien sepa arreglar sillas.',
    'Si llegan nuevos vecinos, les enseñaré el camino. Los chismes se los aprenderán solos.',
    'He oído que esperan mudarse más familias. A ver si alguna comparte recetas.',
    'Mientras haya gente esperando solar, mi vecino seguirá ensayando su discurso de bienvenida.',
    'Si conseguimos sitio para todos, ojalá el próximo vecino ronque menos.',
  ]),
  ...templates('dailyLife', [
    'Mi vecino dice que su gallina pone dos huevos al día. Yo digo que cuenta uno dos veces.',
    'Quien inventó barrer la casa nunca vivió con un vecino que llega lleno de barro.',
    'El gobernador sabrá de aldeas, pero a ver si sabe quitar una mancha de sopa.',
    'Mi vecino me debe tres monedas y todavía me da consejos para ahorrar.',
    'Si hablara menos con los vecinos, llegaría antes a casa y tendría menos que contar.',
  ]),
  ...templates('market', [
    'Voy al mercado a escuchar precios y vuelvo sabiendo quién discutió con quién.',
    'Hay quien pasa por el mercado solo para probar su voz de regatear.',
  ]),
  ...templates('warehouse', [
    'Si algún día me dejan ordenar un almacén, los troncos tendrán que ponerse en fila.',
    'Dicen que el almacén tiene sitio para todo. Dudo que tengan sitio para los consejos de mi vecino.',
  ]),
  ...templates('road', [
    'El camino es buen lugar para saludar. Para despedirse, depende de cuánto hable el vecino.',
    'Trazar un camino parece fácil hasta que todos opinan dónde debe doblar.',
  ]),
  ...templates('prosperity', [
    'Con comida, agua y leña en casa, y trabajo en la aldea, da gusto levantarse.',
    'Nos alcanza para pasar bien el día. Hasta discutimos por cosas pequeñas otra vez.',
  ]),
];

export const housingVoiceTemplates = {
  positive: [
    '¡Por fin mejoramos nuestra casa!',
    '¡Mejoramos la casa! Ahora mi vecino viene a pedir prestada la escalera.',
    'Con la casa renovada, hasta da gusto invitar a alguien a cenar.',
    'Ahora que mejoramos la casa, mi familia no para de buscarle sitio a la mesa.',
  ],
  negative: [
    'Nuestra casa ya no es lo que era. Ha bajado de nivel.',
    'La casa va a menos. Lo dice hasta el vecino que nunca se fija en nada.',
    'Tocó conformarnos con una casa más modesta. Ojalá podamos arreglarla pronto.',
    'La casa se nos ha venido a menos y todavía hay quien pregunta cuándo invitamos a cenar.',
  ],
} as const;
