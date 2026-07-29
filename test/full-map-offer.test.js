import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFER_CODES, offerCatalog } from '../src/commerce.js';

test('полная карта по умолчанию продаётся за 199 ₽ со старой ценой 999 ₽', () => {
  const offer = offerCatalog({})[OFFER_CODES.FULL_MAP];

  assert.equal(offer.amount, 199);
  assert.equal(offer.originalAmount, 999);
});

test('новая переменная скидочной цены управляет оплатой независимо от старой Railway-переменной', () => {
  const offer = offerCatalog({
    FULL_MAP_PRICE: '990',
    FULL_MAP_DISCOUNT_PRICE: '249',
    FULL_MAP_ORIGINAL_PRICE: '999',
  })[OFFER_CODES.FULL_MAP];

  assert.equal(offer.amount, 249);
  assert.equal(offer.originalAmount, 999);
});

test('старая цена скрывается, если она не выше цены оплаты', () => {
  const offer = offerCatalog({
    FULL_MAP_DISCOUNT_PRICE: '999',
    FULL_MAP_ORIGINAL_PRICE: '999',
  })[OFFER_CODES.FULL_MAP];

  assert.equal(offer.originalAmount, null);
});
