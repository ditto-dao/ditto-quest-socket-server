// Login

export const VALIDATE_LOGIN_EVENT = 'validate-login';

export const LOGIN_INVALID_EVENT = 'login-invalid';

export const LOGIN_VALIDATED_EVENT = 'login-validated';

export const TG_VALIDATE_ERROR_EVENT = 'tele-validate-error';

export const LOGOUT_USER_FROM_TMA_EVENT = 'logout-user';

export const DISCONNECT_USER_EVENT = 'disconnect-user'

export const USER_DATA_ON_LOGIN_EVENT = 'user-data-on-login';

export const FIRST_LOGIN_EVENT = 'user-first-login';

export const USE_REFERRAL_CODE = 'use-referral-code';

// User

export const USER_UPDATE_EVENT = 'user-update';

export const STORE_FINGERPRINT_EVENT = 'store-user-fingerprint';

// Combat

export const START_COMBAT_DOMAIN_EVENT = 'start-combat-domain';

export const COMBAT_STARTED_EVENT = 'combat-start';

export const STOP_COMBAT_EVENT = 'stop-combat';

export const COMBAT_STOPPED_EVENT = 'combat-stop';

export const COMBAT_HP_CHANGE_EVENT = 'combat-hp-change';

export const COMBAT_USER_DIED_EVENT = 'combat-user-died';

export const COMBAT_UPDATE_EVENT = 'combat-update';

export const COMBAT_EXP_UPDATE_EVENT = 'combat-exp-update';

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