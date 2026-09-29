export type Language = 'en' | 'vi';

export interface Translations {
  common: {
    loadingGateway: string;
    localSecurityActive: string;
    syncQuota: string;
    syncing: string;
    syncTooltip: string;
    gatewayOnline: string;
    versionStandalone: string;
    brandSubtitle: string;
    copy: string;
    copied: string;
    cancel: string;
    delete: string;
    sync: string;
    close: string;
    done: string;
    actions: string;
    never: string;
    status: string;
    active: string;
    disabled: string;
    cooldown: string;
  };
  navigation: {
    dashboard: string;
    accounts: string;
    models: string;
    apiKeys: string;
    audit: string;
  };
  tabs: {
    dashboard: {
      title: string;
      subtitle: string;
    };
    accounts: {
      title: string;
      subtitle: string;
    };
    models: {
      title: string;
      subtitle: string;
    };
    apiKeys: {
      title: string;
      subtitle: string;
    };
    audit: {
      title: string;
      subtitle: string;
    };
  };
  login: {
    title: string;
    subtitle: string;
    apiKeyLabel: string;
    placeholder: string;
    submit: string;
    submitting: string;
    footerHint: string;
    errorEmpty: string;
    errorInvalid: string;
    errorConnection: string;
  };
  dashboard: {
    upstreamDiscoveryActive: string;
    welcomeTitle: string;
    welcomeDesc: string;
    viewAccounts: string;
    syncNow: string;
    syncing: string;
    accountsCardTitle: string;
    accountsActiveCount: string;
    accountsCooldownWarning: string;
    accountsAllReady: string;
    modelsCardTitle: string;
    modelsTagLive: string;
    modelsDesc: string;
    apiKeysCardTitle: string;
    apiKeysActiveCount: string;
    apiKeysDesc: string;
    uptimeCardTitle: string;
    uptimeOnlineText: string;
    uptimeStrategy: string;
    quotaSectionTitle: string;
    quotaSectionSubtitle: string;
    accountDetailsLink: string;
    noAccountsWarning: string;
    noQuotaData: string;
  };
  accounts: {
    titleWithCount: string;
    description: string;
    addAccountBtn: string;
    openingOAuth: string;
    oauthOpenedTitle: string;
    oauthBlockedHint: string;
    noAccountsYet: string;
    noAccountsSubhint: string;
    projectLabel: string;
    tierLabel: string;
    cooldownRemaining: string;
    confirmDelete: string;
    deleteFailed: string;
    syncFailed: string;
    oauthError: string;
    modelQuotasTitle: string;
    noQuotaSyncHint: string;
    resetCountdown: string;
    resettingNow: string;
  };
  models: {
    catalogTitle: string;
    catalogDesc: string;
    searchPlaceholder: string;
    guideTitle: string;
    cursorTitle: string;
    cursorInstruction: string;
    claudeCodeTitle: string;
    claudeCodeInstruction: string;
    copyModelId: string;
    thinkingTag: string;
    anthropicTag: string;
    geminiTag: string;
  };
  apiKeys: {
    titleWithCount: string;
    description: string;
    createBtn: string;
    noKeysYet: string;
    table: {
      name: string;
      apiKey: string;
      role: string;
      accounts: string;
      allAccounts: string;
      status: string;
      lastUsed: string;
      actions: string;
    };
    hashedKeyHint: string;
    deleteKey: string;
    confirmDelete: string;
    deleteFailed: string;
    updateFailed: string;
    createFailed: string;
    modal: {
      title: string;
      nameLabel: string;
      namePlaceholder: string;
      roleLabel: string;
      roleClient: string;
      roleAdmin: string;
      accountsScopeLabel: string;
      allAccountsOption: string;
      customAccountsOption: string;
      selectAccountsHint: string;
      noAccountsConfigured: string;
      submitBtn: string;
      submittingBtn: string;
      successTitle: string;
      successWarning: string;
    };
  };
  audit: {
    titleWithCount: string;
    description: string;
    refreshBtn: string;
    filterPlaceholder: string;
    filters: {
      all: string;
      success: string;
      rateLimit: string;
      error: string;
    };
    noLogsMatch: string;
    table: {
      time: string;
      apiKey: string;
      methodRoute: string;
      model: string;
      status: string;
      latency: string;
      tokens: string;
    };
  };
}
