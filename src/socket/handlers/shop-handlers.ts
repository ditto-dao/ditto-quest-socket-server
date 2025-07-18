import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { SocketManager } from "../socket-manager"
import { PURCHASE_SHOP_ITEM_GP_EVENT, USER_UPDATE_EVENT, CREATE_STARS_PURCHASE_EVENT, STARS_INVOICE_CREATED_EVENT } from "../events"
import { globalIdleSocketUserLock } from "../socket-handlers"
import { requireLoggedInUser } from "../auth-helper"
import { GameCodexManager } from "../../managers/game-codex/game-codex-manager"
import { incrementUserGold } from "../../operations/user-operations"
import { handleShopPurchase, getInventorySlotPriceGP, getSlimeInventorySlotPriceGP } from "../../operations/shop-operations"
import { ServiceType, ShopItemType } from "@prisma/client"
import { BOT_TOKEN } from "../../utils/config"
import { canUserMintItem } from "../../operations/item-inventory-operations"
import { canUserMintEquipment } from "../../operations/equipment-inventory-operations"

interface PurchaseShopItemPayload {
    userId: string;
    shopItemId: number;
    quantity?: number;
}

export async function setupShopSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager
): Promise<void> {

    // Purchase with GP (immediate)
    socket.on(PURCHASE_SHOP_ITEM_GP_EVENT, async (data: PurchaseShopItemPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received PURCHASE_SHOP_ITEM_GP_EVENT from user ${data.userId}:`, data);

                if (!requireLoggedInUser(data.userId, socket)) return;

                const shopItem = GameCodexManager.getShopItem(data.shopItemId);
                if (!shopItem) {
                    throw new Error(`Shop item ${data.shopItemId} not found`);
                }

                const quantity = data.quantity || 1;

                // Calculate total price using the same logic as DITTO handler
                let totalPrice: number;

                if (shopItem.type === ShopItemType.SERVICE) {
                    // Dynamic pricing for services
                    if (shopItem.serviceType === ServiceType.INVENTORY_SLOT) {
                        if (!shopItem.priceGP) {
                            throw new Error("Inventory slot service missing base price");
                        }
                        const unitPrice = getInventorySlotPriceGP(data.userId, shopItem.priceGP);
                        totalPrice = unitPrice * quantity;
                    } else if (shopItem.serviceType === ServiceType.SLIME_INVENTORY_SLOT) {
                        if (!shopItem.priceGP) {
                            throw new Error("Slime inventory slot service missing base price");
                        }
                        const unitPrice = getSlimeInventorySlotPriceGP(data.userId, shopItem.priceGP);
                        totalPrice = unitPrice * quantity;
                    } else {
                        // Other services use static pricing
                        if (!shopItem.priceGP) {
                            throw new Error("Item not available for GP purchase");
                        }
                        totalPrice = shopItem.priceGP * quantity;
                    }
                } else {
                    // Equipment and items use static pricing
                    if (!shopItem.priceGP) {
                        throw new Error("Item not available for GP purchase");
                    }
                    totalPrice = shopItem.priceGP * quantity;
                }

                logger.info(`💰 Calculated price for user ${data.userId}: ${totalPrice} GP (${quantity}x item ${data.shopItemId})`);

                // Deduct GP first
                const goldBalance = await incrementUserGold(data.userId, -totalPrice);

                // Collect all updates in one object
                const allUpdates: { [key: string]: any } = {
                    goldBalance
                };

                // Process the purchase and collect service updates
                try {
                    const serviceUpdates = await handleShopPurchase(data.userId, shopItem, quantity, socketManager);
                    Object.assign(allUpdates, serviceUpdates);

                    // SINGLE EVENT EMIT with all updates
                    socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                        userId: data.userId,
                        payload: allUpdates
                    });

                    logger.info(`✅ Purchase successful for user ${data.userId}: ${quantity}x ${shopItem.type} for ${totalPrice} GP`);
                } catch (err) {
                    logger.error(`❌ Purchase handling failed, reverting payment: ${err}`);

                    // Revert the payment
                    const goldBalanceRevert = await incrementUserGold(data.userId, totalPrice);
                    socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                        userId: data.userId,
                        payload: { goldBalance: goldBalanceRevert }
                    });

                    throw err;
                }

            } catch (error) {
                logger.error(`Error processing PURCHASE_SHOP_ITEM_GP_EVENT: ${error}`);
                socket.emit('error', {
                    userId: data.userId,
                    msg: `Purchase failed: ${(error as Error).message}`
                });
            }
        });
    });

    // Production-hardened Stars Purchase Handler with comprehensive validation
    socket.on(CREATE_STARS_PURCHASE_EVENT, async (data: PurchaseShopItemPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received ${CREATE_STARS_PURCHASE_EVENT} from user ${data.userId}: ${JSON.stringify(data)}`);

                // === STEP 1: USER VALIDATION ===
                if (!requireLoggedInUser(data.userId, socket)) return;

                // Validate userId format (should be numeric string for Telegram ID)
                if (!data.userId || typeof data.userId !== 'string' || !/^\d+$/.test(data.userId)) {
                    throw new Error('Invalid userId format');
                }

                // === STEP 2: INPUT VALIDATION ===
                if (!data.shopItemId || typeof data.shopItemId !== 'number' || data.shopItemId <= 0) {
                    throw new Error('Invalid shopItemId');
                }

                const quantity = data.quantity || 1;
                if (typeof quantity !== 'number' || quantity <= 0 || quantity > 999) {
                    throw new Error('Invalid quantity (must be 1-999)');
                }

                // === STEP 3: SHOP ITEM VALIDATION ===
                const shopItem = GameCodexManager.getShopItem(data.shopItemId);
                if (!shopItem) {
                    throw new Error(`Shop item ${data.shopItemId} not found`);
                }

                // Validate shop item has Stars pricing
                if (!shopItem.priceStars || shopItem.priceStars <= 0) {
                    throw new Error("Item not available for Stars purchase");
                }

                // Validate shop item is active/available
                if (!shopItem.isActive) {
                    throw new Error("Item is currently unavailable");
                }

                // === STEP 4: INVENTORY SPACE VALIDATION ===
                // Check if user has enough inventory space for the purchase
                // This is CRITICAL - user must have space before payment

                // Determine what type of item this is and check space
                let hasInventorySpace = false;
                if (shopItem.itemId) {
                    // It's an item - check item inventory space
                    hasInventorySpace = await canUserMintItem(data.userId, shopItem.itemId);
                    if (!hasInventorySpace) {
                        throw new Error('Inventory full. Please clear space or upgrade your slots before purchasing items');
                    }
                } else if (shopItem.equipmentId) {
                    // It's equipment - check equipment inventory space
                    hasInventorySpace = await canUserMintEquipment(data.userId, shopItem.equipmentId);
                    if (!hasInventorySpace) {
                        throw new Error('Inventory full. Please clear space or upgrade your slots before purchasing equipment');
                    }
                } else {
                    hasInventorySpace = true;
                }

                if (!hasInventorySpace) {
                    throw new Error('Inventory full. Please clear space or upgrade your slots');
                }

                // === STEP 5: PURCHASE CALCULATION WITH OVERFLOW PROTECTION ===
                let finalStarsPrice = shopItem.priceStars;

                // Apply dynamic pricing for inventory slot services
                if (shopItem.serviceType === 'INVENTORY_SLOT') {
                    finalStarsPrice = getInventorySlotPriceGP(data.userId, shopItem.priceStars);
                } else if (shopItem.serviceType === 'SLIME_INVENTORY_SLOT') {
                    finalStarsPrice = getSlimeInventorySlotPriceGP(data.userId, shopItem.priceStars);
                }

                const totalStars = finalStarsPrice * quantity;

                if (totalStars <= 0) {
                    throw new Error('Invalid total Stars amount');
                }

                // === STEP 6: INVOICE DATA VALIDATION ===
                const sanitizedTitle = `${quantity}x ${shopItem.name}`.substring(0, 32); // Telegram limit
                const sanitizedDescription = 'Ditto Quest Shop Purchase'.substring(0, 255); // Telegram limit

                const invoicePayload = {
                    userId: data.userId,
                    shopItemId: data.shopItemId,
                    quantity: quantity,
                    timestamp: Date.now() // Add timestamp for tracking
                };

                // Validate payload can be serialized
                const payloadString = JSON.stringify(invoicePayload);
                if (payloadString.length > 512) { // Telegram payload limit
                    throw new Error('Invoice payload too large');
                }

                const invoiceData = {
                    title: sanitizedTitle,
                    description: sanitizedDescription,
                    payload: payloadString,
                    provider_token: "", // Empty for Stars
                    currency: "XTR",
                    prices: [{
                        label: "Total",
                        amount: totalStars
                    }]
                };

                // === STEP 7: ADDITIONAL SECURITY VALIDATIONS ===
                // Validate BOT_TOKEN exists and is properly formatted
                if (!BOT_TOKEN || typeof BOT_TOKEN !== 'string' || !BOT_TOKEN.includes(':')) {
                    throw new Error('Invalid BOT_TOKEN configuration');
                }

                logger.info(`📊 Creating invoice for ${totalStars} Stars (${quantity}x ${shopItem.name})`);

                // === STEP 8: SECURE CURL EXECUTION ===
                try {
                    const { execSync } = require('child_process');

                    logger.info(`🚀 Using curl subprocess (Node.js networking blocked)`);

                    // Sanitize the invoice data for shell execution
                    const sanitizedInvoiceData = JSON.stringify(invoiceData);

                    // Validate JSON doesn't contain shell injection characters
                    if (sanitizedInvoiceData.includes('`') || sanitizedInvoiceData.includes('$') ||
                        sanitizedInvoiceData.includes('\\') || sanitizedInvoiceData.includes('"')) {
                        // Re-escape any problematic characters
                        const escapedData = sanitizedInvoiceData.replace(/'/g, "'\\''");
                        logger.warn('⚠️ Found special characters in invoice data, escaped them');
                    }

                    // Build secure curl command with explicit parameters
                    const curlCommand = `curl -X POST -H "Content-Type: application/json" -d '${sanitizedInvoiceData}' --connect-timeout 10 --max-time 25 --retry 2 --retry-delay 1 --retry-max-time 30 --fail-with-body --silent --show-error "https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink"`;

                    logger.info(`🔧 Executing secure curl command`);

                    const stdout = execSync(curlCommand, {
                        timeout: 35000, // 35 second timeout
                        encoding: 'utf8',
                        maxBuffer: 1024 * 1024, // 1MB buffer
                        env: { ...process.env, PATH: process.env.PATH }, // Explicit PATH
                        stdio: ['pipe', 'pipe', 'pipe'] // Explicit stdio
                    });

                    logger.info(`📡 Curl response received (${stdout.length} bytes)`);

                    // === STEP 9: RESPONSE VALIDATION ===
                    if (!stdout || stdout.trim() === '') {
                        throw new Error('Empty response from Telegram API');
                    }

                    let result;
                    try {
                        result = JSON.parse(stdout);
                    } catch (parseError) {
                        logger.error(`❌ Failed to parse Telegram response: ${parseError}`);
                        logger.error(`❌ Raw response: ${stdout}`);
                        throw new Error('Invalid response format from Telegram API');
                    }

                    // Validate response structure
                    if (!result || typeof result !== 'object') {
                        throw new Error('Invalid response structure from Telegram API');
                    }

                    if (!result.ok) {
                        const errorMsg = result.description || 'Unknown Telegram API error';
                        logger.error(`❌ Telegram API error: ${errorMsg}`);
                        throw new Error(`Telegram API error: ${errorMsg}`);
                    }

                    if (!result.result || typeof result.result !== 'string') {
                        throw new Error('Invalid invoice URL in response');
                    }

                    // Validate the invoice URL format
                    const invoiceUrl = result.result;
                    if (!invoiceUrl.startsWith('https://t.me/')) {
                        throw new Error('Invalid invoice URL format');
                    }

                    // === STEP 10: SUCCESS RESPONSE ===
                    socket.emit(STARS_INVOICE_CREATED_EVENT, {
                        userId: data.userId,
                        payload: {
                            invoiceUrl: invoiceUrl,
                            shopItemId: data.shopItemId,
                            shopItemName: shopItem.name,
                            quantity: quantity,
                            totalStars: totalStars,
                            itemName: shopItem.name,
                            timestamp: Date.now()
                        }
                    });

                    logger.info(`✅ Created Stars invoice for user ${data.userId}: ${totalStars} Stars (${quantity}x ${shopItem.name})`);

                } catch (error: any) {
                    logger.error(`❌ Curl subprocess error: ${error.message || error}`);

                    // Log additional error details for debugging
                    if (error.status) {
                        logger.error(`❌ Curl exit code: ${error.status}`);
                    }
                    if (error.stderr) {
                        logger.error(`❌ Curl stderr: ${error.stderr}`);
                    }
                    if (error.signal) {
                        logger.error(`❌ Curl signal: ${error.signal}`);
                    }

                    throw new Error(`Failed to create Stars invoice: ${error.message || 'Unknown error'}`);
                }

            } catch (error) {
                logger.error(`❌ Error creating Stars purchase: ${error}`);

                // Send user-friendly error message
                const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
                socket.emit('error', {
                    userId: data.userId,
                    msg: `Failed to create Stars purchase: ${errorMsg}`,
                    code: 'STARS_PURCHASE_ERROR'
                });
            }
        });
    });
}