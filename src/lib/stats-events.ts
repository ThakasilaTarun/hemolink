/** Notify dashboard components to refresh stats */
export const notifyStatsChanged = () => {
  window.dispatchEvent(new CustomEvent("hemolink:stats-changed"));
};

export const STATS_CHANGED_EVENT = "hemolink:stats-changed";
