// utils/dates.js
import dayjsBase from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js"; // 👈 bunu ekle

dayjsBase.extend(utc);
dayjsBase.extend(tz); // 👈 timezone desteği

// Temel export
export const dayjs = dayjsBase;

// Yardımcı fonksiyonlar
export const toTR = (d) => dayjs.utc(d).tz("Europe/Istanbul");
export const fmtTR = (d, p = "DD.MM.YYYY HH:mm") => toTR(d).format(p);