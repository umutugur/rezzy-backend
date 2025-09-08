import dayjsBase from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjsBase.extend(utc);
export const dayjs = dayjsBase;  // dayjs().utc() vb.
