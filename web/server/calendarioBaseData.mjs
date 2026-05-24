/**
 * Dati statici calendario base (clima anno tipo) — importabili dal runtime Vite/API.
 */

export const ZONE_CLIMATICHE = [
  "nord_pianura",
  "centro_tirrenico",
  "sud_isole_arido",
  "alpino_appenninico",
];

/** GDD mensile (base 10 °C), ET0 mm/g, pioggia mm, Kc — valori anno tipo indicativi. */
export const CLIMA_MENSILE_BY_ZONA = {
  nord_pianura: [
    { mese: 1, t_media_c: 2.0, t_min_media_c: -2.0, gdd_mese: 0, et0_mm_giorno: 0.8, pioggia_mm: 55, kc_prato: 0.58 },
    { mese: 2, t_media_c: 4.5, t_min_media_c: 0.0, gdd_mese: 15, et0_mm_giorno: 1.2, pioggia_mm: 50, kc_prato: 0.58 },
    { mese: 3, t_media_c: 9.5, t_min_media_c: 3.5, gdd_mese: 45, et0_mm_giorno: 2.0, pioggia_mm: 65, kc_prato: 0.65 },
    { mese: 4, t_media_c: 14.0, t_min_media_c: 7.0, gdd_mese: 90, et0_mm_giorno: 3.0, pioggia_mm: 75, kc_prato: 0.65 },
    { mese: 5, t_media_c: 19.0, t_min_media_c: 12.0, gdd_mese: 140, et0_mm_giorno: 4.0, pioggia_mm: 80, kc_prato: 0.65 },
    { mese: 6, t_media_c: 23.5, t_min_media_c: 16.5, gdd_mese: 200, et0_mm_giorno: 4.8, pioggia_mm: 70, kc_prato: 0.82 },
    { mese: 7, t_media_c: 26.0, t_min_media_c: 19.0, gdd_mese: 240, et0_mm_giorno: 5.2, pioggia_mm: 55, kc_prato: 0.82 },
    { mese: 8, t_media_c: 25.0, t_min_media_c: 18.0, gdd_mese: 220, et0_mm_giorno: 4.9, pioggia_mm: 60, kc_prato: 0.82 },
    { mese: 9, t_media_c: 20.5, t_min_media_c: 14.0, gdd_mese: 150, et0_mm_giorno: 3.5, pioggia_mm: 70, kc_prato: 0.65 },
    { mese: 10, t_media_c: 14.5, t_min_media_c: 8.5, gdd_mese: 85, et0_mm_giorno: 2.4, pioggia_mm: 85, kc_prato: 0.65 },
    { mese: 11, t_media_c: 8.0, t_min_media_c: 3.0, gdd_mese: 30, et0_mm_giorno: 1.4, pioggia_mm: 75, kc_prato: 0.58 },
    { mese: 12, t_media_c: 3.5, t_min_media_c: -1.0, gdd_mese: 5, et0_mm_giorno: 0.9, pioggia_mm: 60, kc_prato: 0.58 },
  ],
  centro_tirrenico: [
    { mese: 1, t_media_c: 8.0, t_min_media_c: 3.0, gdd_mese: 20, et0_mm_giorno: 1.4, pioggia_mm: 70, kc_prato: 0.58 },
    { mese: 2, t_media_c: 9.0, t_min_media_c: 4.0, gdd_mese: 35, et0_mm_giorno: 1.8, pioggia_mm: 65, kc_prato: 0.58 },
    { mese: 3, t_media_c: 12.0, t_min_media_c: 6.5, gdd_mese: 70, et0_mm_giorno: 2.5, pioggia_mm: 60, kc_prato: 0.65 },
    { mese: 4, t_media_c: 15.5, t_min_media_c: 9.5, gdd_mese: 110, et0_mm_giorno: 3.4, pioggia_mm: 55, kc_prato: 0.65 },
    { mese: 5, t_media_c: 20.0, t_min_media_c: 13.5, gdd_mese: 165, et0_mm_giorno: 4.5, pioggia_mm: 45, kc_prato: 0.65 },
    { mese: 6, t_media_c: 24.5, t_min_media_c: 17.5, gdd_mese: 230, et0_mm_giorno: 5.4, pioggia_mm: 25, kc_prato: 0.82 },
    { mese: 7, t_media_c: 27.5, t_min_media_c: 20.0, gdd_mese: 270, et0_mm_giorno: 5.8, pioggia_mm: 15, kc_prato: 0.82 },
    { mese: 8, t_media_c: 27.0, t_min_media_c: 19.5, gdd_mese: 255, et0_mm_giorno: 5.5, pioggia_mm: 20, kc_prato: 0.82 },
    { mese: 9, t_media_c: 23.0, t_min_media_c: 16.5, gdd_mese: 180, et0_mm_giorno: 4.2, pioggia_mm: 55, kc_prato: 0.65 },
    { mese: 10, t_media_c: 17.5, t_min_media_c: 12.0, gdd_mese: 110, et0_mm_giorno: 3.0, pioggia_mm: 80, kc_prato: 0.65 },
    { mese: 11, t_media_c: 12.5, t_min_media_c: 7.5, gdd_mese: 55, et0_mm_giorno: 2.0, pioggia_mm: 95, kc_prato: 0.58 },
    { mese: 12, t_media_c: 9.0, t_min_media_c: 4.5, gdd_mese: 25, et0_mm_giorno: 1.5, pioggia_mm: 85, kc_prato: 0.58 },
  ],
  sud_isole_arido: [
    { mese: 1, t_media_c: 11.0, t_min_media_c: 6.0, gdd_mese: 40, et0_mm_giorno: 1.8, pioggia_mm: 45, kc_prato: 0.58 },
    { mese: 2, t_media_c: 11.5, t_min_media_c: 6.5, gdd_mese: 50, et0_mm_giorno: 2.0, pioggia_mm: 40, kc_prato: 0.58 },
    { mese: 3, t_media_c: 14.0, t_min_media_c: 8.5, gdd_mese: 85, et0_mm_giorno: 2.8, pioggia_mm: 35, kc_prato: 0.65 },
    { mese: 4, t_media_c: 17.0, t_min_media_c: 11.0, gdd_mese: 125, et0_mm_giorno: 3.8, pioggia_mm: 30, kc_prato: 0.65 },
    { mese: 5, t_media_c: 21.5, t_min_media_c: 15.0, gdd_mese: 185, et0_mm_giorno: 4.8, pioggia_mm: 25, kc_prato: 0.65 },
    { mese: 6, t_media_c: 26.0, t_min_media_c: 19.0, gdd_mese: 250, et0_mm_giorno: 5.8, pioggia_mm: 12, kc_prato: 0.82 },
    { mese: 7, t_media_c: 29.0, t_min_media_c: 22.0, gdd_mese: 300, et0_mm_giorno: 6.2, pioggia_mm: 8, kc_prato: 0.82 },
    { mese: 8, t_media_c: 29.0, t_min_media_c: 21.5, gdd_mese: 290, et0_mm_giorno: 6.0, pioggia_mm: 10, kc_prato: 0.82 },
    { mese: 9, t_media_c: 25.0, t_min_media_c: 18.5, gdd_mese: 200, et0_mm_giorno: 4.8, pioggia_mm: 35, kc_prato: 0.65 },
    { mese: 10, t_media_c: 20.0, t_min_media_c: 14.5, gdd_mese: 130, et0_mm_giorno: 3.5, pioggia_mm: 55, kc_prato: 0.65 },
    { mese: 11, t_media_c: 15.5, t_min_media_c: 10.5, gdd_mese: 75, et0_mm_giorno: 2.4, pioggia_mm: 65, kc_prato: 0.58 },
    { mese: 12, t_media_c: 12.0, t_min_media_c: 7.5, gdd_mese: 45, et0_mm_giorno: 1.9, pioggia_mm: 50, kc_prato: 0.58 },
  ],
  alpino_appenninico: [
    { mese: 1, t_media_c: 0.0, t_min_media_c: -5.0, gdd_mese: 0, et0_mm_giorno: 0.6, pioggia_mm: 50, kc_prato: 0.58 },
    { mese: 2, t_media_c: 1.5, t_min_media_c: -4.0, gdd_mese: 5, et0_mm_giorno: 0.9, pioggia_mm: 45, kc_prato: 0.58 },
    { mese: 3, t_media_c: 5.5, t_min_media_c: 0.0, gdd_mese: 25, et0_mm_giorno: 1.6, pioggia_mm: 55, kc_prato: 0.65 },
    { mese: 4, t_media_c: 10.0, t_min_media_c: 3.5, gdd_mese: 60, et0_mm_giorno: 2.6, pioggia_mm: 70, kc_prato: 0.65 },
    { mese: 5, t_media_c: 15.0, t_min_media_c: 8.0, gdd_mese: 110, et0_mm_giorno: 3.6, pioggia_mm: 85, kc_prato: 0.65 },
    { mese: 6, t_media_c: 19.5, t_min_media_c: 12.5, gdd_mese: 165, et0_mm_giorno: 4.4, pioggia_mm: 90, kc_prato: 0.82 },
    { mese: 7, t_media_c: 22.0, t_min_media_c: 14.5, gdd_mese: 195, et0_mm_giorno: 4.8, pioggia_mm: 75, kc_prato: 0.82 },
    { mese: 8, t_media_c: 21.5, t_min_media_c: 14.0, gdd_mese: 185, et0_mm_giorno: 4.5, pioggia_mm: 80, kc_prato: 0.82 },
    { mese: 9, t_media_c: 17.0, t_min_media_c: 10.0, gdd_mese: 120, et0_mm_giorno: 3.2, pioggia_mm: 75, kc_prato: 0.65 },
    { mese: 10, t_media_c: 11.5, t_min_media_c: 5.0, gdd_mese: 55, et0_mm_giorno: 2.0, pioggia_mm: 90, kc_prato: 0.65 },
    { mese: 11, t_media_c: 5.0, t_min_media_c: 0.0, gdd_mese: 15, et0_mm_giorno: 1.1, pioggia_mm: 80, kc_prato: 0.58 },
    { mese: 12, t_media_c: 1.0, t_min_media_c: -4.0, gdd_mese: 0, et0_mm_giorno: 0.7, pioggia_mm: 55, kc_prato: 0.58 },
  ],
};
