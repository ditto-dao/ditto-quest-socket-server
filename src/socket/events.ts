// Login

export const VALIDATE_LOGIN_EVENT = 'validate-login';

export const LOGIN_INVALID_EVENT = 'login-invalid';

export const LOGIN_VALIDATED_EVENT = 'login-validated';

export const TG_VALIDATE_ERROR_EVENT = 'tele-validate-error';

export const LOGOUT_USER_FROM_TMA_EVENT = 'logout-user';

export const DISCONNECT_USER_EVENT = 'disconnect-user'

export const USER_DATA_ON_LOGIN_EVENT = 'user-data-on-login';

export const FIRST_LOGIN_EVENT = 'user-first-login';

export const READ_REFERRAL_CODE = 'read-user-referral-code';

export const READ_REFERRAL_CODE_RES = 'read-user-referral-code-res';

export const READ_REFERRAL_STATS = 'read-user-referral-stats';

export const READ_REFERRAL_STATS_RES = 'read-user-referral-stats-res';

export const USE_REFERRAL_CODE = 'use-referral-code';

export const USE_REFERRAL_CODE_SUCCESS = 'use-referral-code-success';

export const BETA_TESTER_LOGIN_EVENT = 'beta-tester-login-event';

// User

export const USER_UPDATE_EVENT = 'user-update';

export const STORE_FINGERPRINT_EVENT = 'store-user-fingerprint';

// Combat

export const START_COMBAT_DOMAIN_EVENT = 'start-combat-domain';

export const START_COMBAT_DUNGEON_EVENT = 'start-combat-dungeon';

export const COMBAT_STARTED_EVENT = 'combat-start';

export const STOP_COMBAT_EVENT = 'stop-combat';

export const COMBAT_STOPPED_EVENT = 'combat-stop';

export const COMBAT_HP_CHANGE_EVENT = 'combat-hp-change';

export const COMBAT_USER_DIED_EVENT = 'combat-user-died';

export const COMBAT_UPDATE_EVENT = 'combat-update';

export const COMBAT_EXP_UPDATE_EVENT = 'combat-exp-update';

export const GET_DUNGEON_LB = 'get-dungeon-lb';

export const DUNGEON_LB_UPDATE_EVENT = 'dungeon-lb-update';

// Ledger

export const LEDGER_INIT_USER_SOCKET_EVENT = 'ditto-ledger-init-user-socket';

export const LEDGER_INIT_USER_SOCKET_SUCCESS_EVENT = 'ditto-ledger-init-user-socket-success';

export const LEDGER_REMOVE_USER_SOCKET_EVENT = 'ditto-ledger-remove-user-socket';

export const LEDGER_READ_BALANCE_EVENT = 'ditto-ledger-read-balance'; // havent used

export const LEDGER_UPDATE_BALANCE_EVENT = 'ditto-ledger-update-balance';

export const LEDGER_READ_BALANCE_UPDATES_EVENT = 'ditto-ledger-read-balance-updates';

export const LEDGER_REVERT_TRX_EVENT = 'ditto-ledger-revert-transaction';

// dont have res function for balance updates arr

export const LEDGER_BALANCE_UPDATE_RES_EVENT = 'ditto-ledger-socket-balance-update';

export const LEDGER_BALANCE_ERROR_RES_EVENT = 'ditto-ledger-socket-balance-error';

export const LEDGER_USER_ERROR_RES_EVENT = 'ditto-ledger-socket-user-error';

// Missions
export const MISSION_UPDATE = 'mission-update';

export const GET_NEXT_MISSION = 'refresh-mission';

// On-chain price
export const READ_ON_CHAIN_PRICE_EVENT = 'ditto-ledger-read-on-chain-price';

export const ON_CHAIN_PRICE_UPDATE_RES_EVENT = 'ditto-ledger-on-chain-price-update';