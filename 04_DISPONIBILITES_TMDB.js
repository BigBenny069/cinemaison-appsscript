/**
 * ============================================================
 * CinéMaison V4
 * Script : 04_DISPONIBILITES_TMDB.gs
 * Rôle   : Watch Providers TMDb uniquement
 * Version: 4.0.0
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs
 * IMPORTANT : ne touche jamais DateDisponibiliteAuto.
 * ============================================================
 */


function controleDisponibilites() {
  controleWatchProvidersTMDbV4();
}


function controleWatchProvidersTMDbV4() {
  try {
    const sheet = getSheet_(SHEETS.FILMS);
    if (!sheet) {
      erreur_("TMDB_PROVIDERS", "INIT", "Feuille Films introuvable", "");
      return;
    }


    resoudreErreur_(
      "TMDB_PROVIDERS",
      "INIT",
      "Feuille Films introuvable"
    );


    const apiKey = lireConfig_("TMDbApiKey", "");
    if (!apiKey) {
      erreur_("TMDB_PROVIDERS", "CONFIG", "TMDbApiKey manquante", "");
      return;
    }


    resoudreErreur_(
      "TMDB_PROVIDERS",
      "CONFIG",
      "TMDbApiKey manquante"
    );


    const data = sheet.getDataRange().getValues();
    const h = headers_(data[0]);
    const max = maxDisponibilitesParCycle_();


    let traites = 0;
    let ok = 0;
    let sansProviders = 0;
    let erreurs = 0;


    for (let i = 1; i < data.length; i++) {
      if (traites >= max) break;


      const rowNumber = i + 1;
      const row = data[i];


      const tmdbId = get_(row, h, "TMDbID");
      const type = get_(row, h, "Type");


      if (!tmdbId) continue;


      try {
        const result = getWatchProviders_(tmdbId, type, apiKey);
        const plateformes = result.plateformes || "";


        if (plateformes) {
          setProtected_(sheet, rowNumber, h, "PlateformesDetectees", plateformes, { force: true });
          setProtected_(sheet, rowNumber, h, "DernierControleDisponibilite", new Date(), { force: true });


          if (!get_(row, h, "SourceDisponibiliteAuto")) {
            setProtected_(sheet, rowNumber, h, "SourceDisponibiliteAuto", "TMDb Watch Providers", { force: true });
          }


          ok++;
        } else {
          sansProviders++;
        }


        // L'appel et le traitement de cette ligne ont abouti, même si
        // TMDb ne renvoie aucun fournisseur pour la France.
        resoudreErreur_("TMDB_PROVIDERS", "LIGNE " + rowNumber);


        traites++;
        Utilities.sleep(250);


      } catch (e) {
        erreurs++;
        erreur_("TMDB_PROVIDERS", "LIGNE " + rowNumber, String(e), "");
        traites++;
      }
    }


    journal_(
      "TMDB_PROVIDERS",
      "CONTROLE",
      "TERMINE",
      "Traités=" + traites + " | OK=" + ok + " | SansProviders=" + sansProviders + " | Erreurs=" + erreurs
    );


    Logger.log("===== WATCH PROVIDERS TMDB V4 =====");
    Logger.log("Traités : " + traites);
    Logger.log("OK : " + ok);
    Logger.log("Sans providers : " + sansProviders);
    Logger.log("Erreurs : " + erreurs);


    // Une ancienne erreur globale n'est close que si le cycle courant
    // s'est terminé sans aucune erreur de ligne.
    if (erreurs === 0) {
      resoudreErreur_("MAILS", "controleWatchProvidersTMDbV4");
    }


  } catch (err) {
    envoyerMailErreurScript_(err, "controleWatchProvidersTMDbV4");
  }
}


function majDisponibiliteLigne_(sheet, rowNumber, h, tmdbId, type) {
  const apiKey = lireConfig_("TMDbApiKey", "");
  if (!apiKey) return;


  const result = getWatchProviders_(tmdbId, type, apiKey);
  const plateformes = result.plateformes || "";


  if (plateformes) {
    setProtected_(sheet, rowNumber, h, "PlateformesDetectees", plateformes, { force: true });
    setProtected_(sheet, rowNumber, h, "DernierControleDisponibilite", new Date(), { force: true });
  }
}


function getWatchProviders_(tmdbId, type, apiKeyParam) {
  const apiKey = apiKeyParam || lireConfig_("TMDbApiKey", "");
  if (!apiKey) return { plateformes: "" };


  const endpoint = type === "Série" ? "tv" : "movie";
  const pays = paysWatchProvider_();


  const url =
    "https://api.themoviedb.org/3/" +
    endpoint +
    "/" +
    encodeURIComponent(tmdbId) +
    "/watch/providers?api_key=" +
    encodeURIComponent(apiKey);


  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();


  if (code !== 200) {
    throw new Error("TMDb Watch Providers HTTP " + code + " pour " + tmdbId);
  }


  const json = JSON.parse(res.getContentText());
  const fr = json.results && json.results[pays];


  if (!fr) {
    return { plateformes: "" };
  }


  const providers = []
    .concat(fr.flatrate || [])
    .concat(fr.ads || [])
    .concat(fr.free || [])
    .concat(fr.rent || [])
    .concat(fr.buy || [])
    .map(p => p.provider_name)
    .filter(Boolean);


  return {
    plateformes: Array.from(new Set(providers)).join(" / ")
  };
}


function testWatchProvidersTMDbV4() {
  const r = getWatchProviders_("228150", "Film");
  Logger.log(JSON.stringify(r, null, 2));
}






