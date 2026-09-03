/**
 * ============================================================
 * CinéMaison V4
 * Script : 09_WEBHOOK.gs
 * Rôle   : Point d'entrée Web App — déclenche un ré-enrichissement
 *          IMMÉDIAT d'une fiche depuis l'application (sans dépendre du
 *          cycle programmé toutes les 5 min, donc sans avoir besoin
 *          d'un PC allumé ou du Sheet ouvert). Reçoit aussi les réglages
 *          du résumé quotidien par email (V1.1).
 * Version: 1.3
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs, 02_TMDB.gs, 03_LETTERBOXD.gs,
 *               05_ENRICHISSEMENT.gs, 10_DIGEST_EMAIL.gs
 *
 * PRINCIPE :
 * L'app (via api/update-film.js) appelle cette Web App en HTTP POST juste
 * après avoir modifié Titre / Année / URLLetterboxd, ou après un clic sur
 * "Redemander une vérification". doPost() ne fait QUE mettre la fiche en
 * file d'attente et répond immédiatement (quelques centaines de ms) — le
 * vrai travail (appels TMDb/Letterboxd, qui peuvent prendre plusieurs
 * secondes) se fait 2 secondes plus tard via un déclencheur éphémère, pour
 * ne jamais risquer de faire expirer la requête HTTP de l'app le temps
 * que Vercel attend une réponse.
 *
 * V1.1 : doPost() accepte aussi un second type de requête — un corps avec
 * "action": "updateDigestSettings" — utilisé par api/update-settings.js
 * pour écrire les réglages du résumé quotidien (10_DIGEST_EMAIL.gs) via
 * ecrireConfig_, sans jamais faire deviner à Vercel la structure exacte
 * de l'onglet CONFIG.
 *
 * Correctif V1.2 :
 * Erreur récurrente observée en journal ("ENRICHISSEMENT | WEBHOOK_APP |
 * Échec relance immédiate... Un autre enrichissement est déjà en
 * cours."). Cause identifiée : LockService.getScriptLock() est un verrou
 * GLOBAL À TOUT LE PROJET, pas propre à chaque fonction — or
 * 05_ENRICHISSEMENT.gs prend ce même verrou à 6 endroits différents pour
 * ses contrôles périodiques (toutes les quelques minutes), certains
 * pouvant le garder jusqu'à 120 secondes. reenrichirParIdSheetV1_
 * n'attendait que 30 secondes avant d'abandonner — largement insuffisant
 * si le webhook se déclenche pile pendant un de ces contrôles. Comme ce
 * traitement est déjà entièrement asynchrone (le déclencheur éphémère
 * tourne 2s après la réponse HTTP déjà envoyée à l'app, Ben n'attend rien
 * en direct), attendre plus longtemps ne dégrade aucune expérience
 * utilisateur. Délai porté de 30s à 90s. empilerReenrichissementWebhookV1_
 * (mise en file, opération courte) porté de 10s à 20s par la même
 * précaution, avec la même marge de sécurité raisonnable.
 *
 * Correctif V1.3 :
 * Le délai de 20s (V1.2) sur empilerReenrichissementWebhookV1_ dépassait
 * les 8 secondes que update-film.js/update-settings.js attendent avant
 * d'abandonner l'appel HTTP (AbortController côté Vercel) -- en cas de
 * verrou occupé, Vercel se déconnectait avant de savoir si la mise en
 * file avait réussi. Ramené à 5s, largement sous la limite Vercel.
 * reenrichirParIdSheetV1_ (90s) n'est pas concerné : il tourne 2s après
 * la réponse HTTP déjà envoyée, totalement déconnecté du délai Vercel.
 *
 * MISE EN PLACE (à faire une seule fois, manuellement) :
 * 1. Dans le Sheet CONFIG, ajoute une ligne "WebhookSecret" avec une valeur
 *    secrète de ton choix (une longue chaîne aléatoire suffit).
 * 2. Dans l'éditeur Apps Script : Déployer > Nouveau déploiement.
 *    Type : Application Web.
 *    Exécuter en tant que : Moi.
 *    Qui a accès : Tout le monde.
 * 3. Copie l'URL de déploiement obtenue (se termine par /exec).
 * 4. Sur Vercel, ajoute ces deux variables d'environnement (Production) :
 *      ENRICH_WEBHOOK_URL = l'URL copiée à l'étape 3
 *      ENRICH_WEBHOOK_SECRET = la même valeur que WebhookSecret (étape 1)
 * 5. Redéploie api/update-film.js et dépose api/update-settings.js.
 *
 * Si tu modifies ce fichier plus tard, il faut créer une NOUVELLE version
 * de déploiement (Déployer > Gérer les déploiements > crayon > Nouvelle
 * version) pour que le changement soit pris en compte — l'URL /exec reste
 * la même d'une version à l'autre.
 * ============================================================
 */

const WEBHOOK_REENRICH_QUEUE_PROP_V1 = "CINEMAISON_WEBHOOK_REENRICH_QUEUE_V1";
const WEBHOOK_REENRICH_HANDLER_V1 = "traiterFileReenrichissementWebhookV1";

/**
 * Point d'entrée HTTP POST. Deux formes de corps JSON acceptées :
 *   1. { "secret": "...", "id": "FILM0123" }
 *      -> ré-enrichissement immédiat (inchangé depuis V1.0).
 *   2. { "secret": "...", "action": "updateDigestSettings",
 *        "actif": true|false, "seuilJours": 7, "destinataires": "a@x.com,b@y.com" }
 *      -> met à jour les réglages du résumé quotidien par email.
 */
function doPost(e) {
  try {
    const corps = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const secret = String(corps.secret || "");
    const secretAttendu = String(lireConfig_("WebhookSecret", ""));

    if (!secretAttendu || secret !== secretAttendu) {
      return reponseJsonWebhook_({ ok: false, error: "Secret incorrect" }, 401);
    }

    if (corps.action === "updateDigestSettings") {
      return traiterMiseAJourReglagesDigestV1_(corps);
    }

    const id = safeTrim_(corps.id || "");
    if (!id) {
      return reponseJsonWebhook_({ ok: false, error: "id manquant" }, 400);
    }

    empilerReenrichissementWebhookV1_(id);
    return reponseJsonWebhook_({ ok: true, queued: true, id: id });
  } catch (err) {
    return reponseJsonWebhook_({ ok: false, error: String(err) }, 500);
  }
}

/**
 * Écrit les réglages du résumé quotidien dans CONFIG via ecrireConfig_ —
 * jamais d'écriture directe de cellule depuis Vercel, pour ne dépendre
 * que de la logique déjà fiable côté Apps Script.
 */
function traiterMiseAJourReglagesDigestV1_(corps) {
  const actif = corps.actif === true ? "OUI" : "NON";
  const seuilJours = Number(corps.seuilJours);
  const destinataires = String(corps.destinataires || "").trim();

  ecrireConfig_("DigestEmailActif", actif);
  if (Number.isFinite(seuilJours) && seuilJours > 0) {
    ecrireConfig_("DigestEmailSeuilJours", String(Math.round(seuilJours)));
  }
  ecrireConfig_("DigestEmailDestinataires", destinataires);

  journal_(
    "DIGEST_EMAIL",
    "REGLAGES_APP",
    "OK",
    "Actif=" + actif + " | Seuil=" + seuilJours + " | Destinataires=" + (destinataires ? destinataires.split(/[,;]/).length : 0)
  );

  return reponseJsonWebhook_({ ok: true, actif: actif, seuilJours: seuilJours, destinataires: destinataires });
}

/**
 * ContentService ne propose pas de setStatusCode direct pour toutes les
 * versions ; le code HTTP renvoyé importe peu ici puisque update-film.js
 * lit le champ "ok" du JSON plutôt que le statut HTTP brut.
 */
function reponseJsonWebhook_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ajoute un id à la file d'attente et programme (ou reprogramme) un
 * déclencheur unique dans 2 secondes. Si plusieurs appels arrivent en
 * rafale (ex. modification de Titre + Année + URL en une seule sauvegarde
 * app), un seul passage traite toute la file — pas un déclencheur par id.
 *
 * Correctif V1.2 : délai d'attente du verrou porté de 10s à 20s, puis
 * ramené à 5s en V1.3 (voir
 * note de version en tête de fichier).
 */
function empilerReenrichissementWebhookV1_(id) {
  const lock = LockService.getScriptLock();
  // Correctif V1.3 : ce délai doit impérativement rester bien en-dessous
  // des 8 secondes que update-film.js/update-settings.js attendent avant
  // d'abandonner l'appel HTTP (voir AbortController côté Vercel) — sinon
  // Vercel se déconnecte avant même de savoir si la mise en file a
  // réussi. Porté de 20s (V1.2, trop long) à 5s : cette opération est de
  // toute façon légère (lecture/écriture d'une seule propriété), un
  // verrou tenu plus de 5s signale un vrai embouteillage plutôt qu'une
  // attente normale.
  if (!lock.tryLock(5000)) {
    throw new Error("Impossible de mettre la fiche en file (verrou occupé) — réessaie dans quelques secondes.");
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const existant = props.getProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1);
    let liste = [];
    if (existant) {
      try {
        liste = JSON.parse(existant);
      } catch (e) {
        liste = [];
      }
    }
    if (liste.indexOf(id) === -1) liste.push(id);
    props.setProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1, JSON.stringify(liste));

    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === WEBHOOK_REENRICH_HANDLER_V1) {
        ScriptApp.deleteTrigger(t);
      }
    });

    ScriptApp.newTrigger(WEBHOOK_REENRICH_HANDLER_V1).timeBased().after(2000).create();

    journal_(
      "ENRICHISSEMENT",
      "WEBHOOK_APP",
      "EN_FILE",
      "Fiche mise en file pour ré-enrichissement immédiat : " + id + " | file totale=" + liste.length
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Appelé par le déclencheur éphémère ~2s après doPost. Traite toute la
 * file en une fois, puis la vide.
 */
function traiterFileReenrichissementWebhookV1() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === WEBHOOK_REENRICH_HANDLER_V1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  const props = PropertiesService.getScriptProperties();
  const existant = props.getProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1);
  props.deleteProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1);
  if (!existant) return;

  let liste = [];
  try {
    liste = JSON.parse(existant);
  } catch (e) {
    liste = [];
  }

  liste.forEach(function (id) {
    try {
      reenrichirParIdSheetV1_(id);
      journal_("ENRICHISSEMENT", "WEBHOOK_APP", "OK", "Fiche relancée immédiatement depuis l'app : " + id);
    } catch (e) {
      erreur_("ENRICHISSEMENT", "WEBHOOK_APP", "Échec relance immédiate depuis l'app : " + id, String(e));
    }
  });
}

/**
 * Ré-enrichit une seule fiche identifiée par la colonne "ID" (celle que
 * l'app connaît et manipule — add-film.js écrit ses nouveaux id dans cette
 * même colonne). Force TMDb + Letterboxd à se relancer intégralement,
 * indépendamment de l'empreinte stockée : c'est volontairement plus
 * "bourrin" qu'une détection fine de ce qui a changé, pour garantir que
 * n'importe quelle modification faite depuis l'app (titre, année, URL, ou
 * simple demande de vérification) soit bien reprise.
 *
 * Correctif V1.2 : délai d'attente du verrou porté de 30s à 90s (voir
 * note de version en tête de fichier — c'est le vrai correctif de
 * l'erreur récurrente).
 */
function reenrichirParIdSheetV1_(idSheet) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) {
    throw new Error("Un autre enrichissement est déjà en cours.");
  }
  try {
    const sheet = getSheet_(SHEETS.FILMS);
    if (!sheet) throw new Error("Feuille Films introuvable.");

    const data = sheet.getDataRange().getValues();
    const h = headers_(data[0]);
    if (h["ID"] === undefined) {
      throw new Error('Colonne "ID" introuvable dans Films.');
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const valeurId = safeTrim_(get_(row, h, "ID"));
      if (valeurId === safeTrim_(idSheet)) {
        const rowNumber = i + 1;
        const analyse = analyserIdentiteEnrichissementV45_(row, h);
        analyse.modifiee = true;
        analyse.identiteModifiee = true;
        analyse.champsRechercheModifies = true;
        analyse.conserverUrlLetterboxd = estUrlLetterboxdReelleV43_(safeTrim_(get_(row, h, "URLLetterboxd")));

        preparerLigneEnrichissementV4_(sheet, rowNumber, row, h, true);
        const resultat = enrichirUneLigneV4_(sheet, rowNumber, row, h, false, analyse);

        Logger.log(
          "WEBHOOK_APP | ID=" + idSheet + " | ligne=" + rowNumber + " | titre=" + safeTrim_(get_(row, h, "Titre")) + " | statut=" + (resultat && resultat.statut)
        );

        return resultat;
      }
    }

    throw new Error('Aucune fiche trouvée avec ID="' + idSheet + '".');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Test manuel depuis l'éditeur — remplace "FILM0001" par un vrai ID
 * existant pour vérifier que le mécanisme fonctionne de bout en bout
 * avant de brancher l'app dessus.
 */
function testerWebhookReenrichissementV1() {
  const resultat = reenrichirParIdSheetV1_("FILM0001");
  Logger.log(JSON.stringify(resultat, null, 2));
}
