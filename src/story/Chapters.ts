import type { SettlementRank, SettlementStats } from '../simulation/SettlementProgress';

export type ChapterTrack = 'story' | 'tutorial';
type Passage = string | ((stats: SettlementStats) => string);
type Chapter = Readonly<{ title: string; story: readonly Passage[]; tutorial: readonly string[] }>;

export const chapters: Readonly<Record<SettlementRank, Chapter>> = {
  aldea: {
    title: 'I · Una tierra por construir',
    story: [
      'Hasta ayer eras quien arreglaba los cercados de la Corona. Una noche de crecida guiaste al rey y a su caballo hasta el único vado seguro. Su Majestad te premió con tierras junto al camino real. El caballo, que tenía mejor memoria, te dio las gracias primero.',
      'El reino se repone de dos malas cosechas. La Corona necesita aldeas capaces de alimentar a sus vecinos y mantener abierto el comercio. Tu encargo es hacer prosperar este rincón. El escribano dibujó un pueblo en el mapa. A ti te toca construirlo.',
    ],
    tutorial: [
      'En Viviendas, elige Zona residencial y colócala en terreno libre. Une el solar al Centro de Aldea mediante caminos de tierra conectados por sus lados. Los edificios de producción y servicio también necesitan acceso a esa red.',
      'Una granja produce comida y un campamento maderero corta madera cuando tienen personal. Los almacenes reciben la producción y los mercados la venden a los hogares cercanos. Un pozo con aguador lleva agua a las viviendas de su zona.',
      'Deja plazas libres en solares conectados, asegura comida y ofrece empleo para atraer familias. Consulta Necesidades para detectar faltantes. En Finanzas puedes comparar ventas e impuestos con salarios y mantenimiento antes de ampliar la aldea.',
    ],
  },
  pueblo: {
    title: 'II · El nacimiento de un pueblo',
    story: [
      'La gente del camino ya pregunta por tu mercado. Donde antes el viento se colaba entre cuatro estacas, ahora hay vecinos que discuten de quién es el turno de barrer. La Corona ha sellado la carta que reconoce a tu asentamiento como Pueblo.',
      stats => stats.happiness >= 75
        ? 'El mensajero encontró a los vecinos tan contentos que pidió una casa para jubilarse. El rey le recordó que aún le quedaban doce años de servicio.'
        : 'El mensajero trajo el sello y se llevó una lista de reparaciones dictada por los vecinos. Hasta en la corte empiezan a saber cuáles son las calles que dan problemas.',
      'Ya puedes abrir parques, afirmar los caminos con grava y levantar una Casa de Comercio. Los mercaderes ofrecen oro por tus excedentes. El rey pide que le guardes un banco bajo la sombra. El escribano pregunta si el banco también se puede exportar.',
    ],
    tutorial: [
      'Coloca un parque conectado cerca de varias viviendas. Abre el inspector de un hogar para ver cuánto aportan sus jardines, parques y caminos. Crónicas cuenta el promedio de las viviendas habitadas.',
      'Selecciona un camino de tierra propio con el menú de construcción cancelado. Pulsa Mejorar a grava y confirma el costo. La conexión se conserva y los hogares cercanos ganan belleza. Vigila que los nuevos barrios queden al alcance de un mercado y un pozo.',
      'Conecta una Casa de Comercio y sus almacenes con la entrada del reino. En el inspector, elige Exportar para vender por encima de una reserva o Importar para comprar hasta un objetivo. El comercio puede ayudarte a reunir los 800 de oro del reconocimiento de Villa. Guarda comida para las mesas antes de cargar el carro.',
    ],
  },
  villa: {
    title: 'III · Una villa digna de la Corona',
    story: [
      'Cuando el rey volvió por el vado, se orientó por el ruido del mercado. Vio los parques, los barrios llenos y los caminos firmes. En presencia de los vecinos leyó la carta de Villa. El caballo, esta vez, recibió una manzana.',
      stats => stats.gold >= 500
        ? 'El escribano examinó las cuentas y se sorprendió de que aún quedara una reserva después del reconocimiento. Pidió una copia para enseñársela al tesorero real.'
        : 'Tras pagar el reconocimiento queda una caja modesta. El rey te aconsejó terminar un barrio antes de inaugurar tres. Según su escribano, aprendió esa lección en su tercer palacio.',
      'Puedes levantar plazas con fuentes y pavimentar en piedra. La corte verá la diferencia al llegar. Tus vecinos la notarán cada día, siempre que el agua, la comida y la madera sigan llegando a cada barrio.',
    ],
    tutorial: [
      'Conecta una plaza con fuente cerca de las viviendas que quieras embellecer. Selecciona un camino de grava para mejorarlo a piedra. La fuente aporta belleza y los pozos siguen abasteciendo de agua.',
      'Consulta Necesidades y Finanzas antes de gastar la reserva. La belleza ayuda a sostener las viviendas avanzadas. Esas viviendas también necesitan buen abastecimiento y empleo para conservar su nivel.',
    ],
  },
};

export function chapterPages(rank: SettlementRank, track: ChapterTrack, stats: SettlementStats): string[] {
  return chapters[rank][track].map(passage => typeof passage === 'string' ? passage : passage(stats));
}
