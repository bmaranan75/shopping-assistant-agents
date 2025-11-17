import { describe, it, expect } from 'vitest';
import { normalizeProductName } from '../src/agents/supervisor/product-utils';

describe('normalizeProductName', () => {
  it('should remove "bag of" descriptor and normalize plural to singular', () => {
    expect(normalizeProductName('bag of apples')).toBe('apple');
  });

  it('should remove "bunch of" descriptor', () => {
    expect(normalizeProductName('bunch of bananas')).toBe('banana');
  });

  it('should remove "carton of" descriptor', () => {
    expect(normalizeProductName('carton of milk')).toBe('milk');
  });

  it('should remove "box of" descriptor', () => {
    expect(normalizeProductName('box of cereals')).toBe('cereal');
  });

  it('should handle multiple descriptors correctly', () => {
    expect(normalizeProductName('bags of apples')).toBe('apple');
    expect(normalizeProductName('bunches of bananas')).toBe('banana');
  });

  it('should remove articles', () => {
    expect(normalizeProductName('a banana')).toBe('banana');
    expect(normalizeProductName('an apple')).toBe('apple');
    expect(normalizeProductName('the milk')).toBe('milk');
  });

  it('should handle simple product names', () => {
    expect(normalizeProductName('apple')).toBe('apple');
    expect(normalizeProductName('banana')).toBe('banana');
    expect(normalizeProductName('milk')).toBe('milk');
  });

  it('should normalize plurals without descriptors', () => {
    expect(normalizeProductName('apples')).toBe('apple');
    expect(normalizeProductName('bananas')).toBe('banana');
    expect(normalizeProductName('oranges')).toBe('orange');
  });

  it('should handle case insensitivity', () => {
    expect(normalizeProductName('Bag of Apples')).toBe('apple');
    expect(normalizeProductName('BUNCH OF BANANAS')).toBe('banana');
  });

  it('should handle "dozen" descriptor', () => {
    expect(normalizeProductName('dozen eggs')).toBe('egg');
    expect(normalizeProductName('a dozen eggs')).toBe('egg');
  });

  it('should handle weight descriptors', () => {
    expect(normalizeProductName('pound of carrots')).toBe('carrots');
    expect(normalizeProductName('pounds of potatoes')).toBe('potato');
  });

  it('should handle volume descriptors', () => {
    expect(normalizeProductName('gallon of milk')).toBe('milk');
    expect(normalizeProductName('bottle of milk')).toBe('milk');
  });

  it('should handle "head of" for produce', () => {
    expect(normalizeProductName('head of carrots')).toBe('carrots');
  });

  it('should handle "loaf of" for bread', () => {
    expect(normalizeProductName('loaf of bread')).toBe('bread');
  });
});
