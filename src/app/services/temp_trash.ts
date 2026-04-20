export interface ProductItem {
  id: string;
  name: string;
  value: number;
}

// ---------------- DISCOUNTS ----------------

export function getDiscount(limit: number, offset: number): ProductItem[] {
  const discounts: ProductItem[] = [
    { id: 'PRD-0001', name: 'Discountable Component 1', value: 0 },
    { id: 'PRD-0002', name: 'Discountable Component 2', value: 1 },
    { id: 'PRD-0003', name: 'Discountable Component 3', value: 2 },
    { id: 'PRD-0004', name: 'Discountable Component 4', value: 3 },
    { id: 'PRD-0005', name: 'Discountable Component 5', value: 4 },
    { id: 'PRD-0006', name: 'Discountable Component 6', value: 5 },
    { id: 'PRD-0007', name: 'Discountable Component 7', value: 6 },
    { id: 'PRD-0008', name: 'Discountable Component 8', value: 7 },
    { id: 'PRD-0009', name: 'Discountable Component 9', value: 8 },
    { id: 'PRD-0010', name: 'Discountable Component 10', value: 9 },
    { id: 'PRD-0011', name: 'Discountable Component 11', value: 10 },
    { id: 'PRD-0012', name: 'Discountable Component 12', value: 11 },
    { id: 'PRD-0013', name: 'Discountable Component 13', value: 12 },
    { id: 'PRD-0014', name: 'Discountable Component 14', value: 13 },
    { id: 'PRD-0015', name: 'Discountable Component 15', value: 14 },
    { id: 'PRD-0016', name: 'Discountable Component 16', value: 15 },
    { id: 'PRD-0017', name: 'Discountable Component 17', value: 16 },
    { id: 'PRD-0018', name: 'Discountable Component 18', value: 17 },
    { id: 'PRD-0019', name: 'Discountable Component 19', value: 18 },
    { id: 'PRD-0020', name: 'Discountable Component 20', value: 19 },
    { id: 'PRD-0021', name: 'Discountable Component 21', value: 20 },
    { id: 'PRD-0022', name: 'Discountable Component 22', value: 21 },
    { id: 'PRD-0023', name: 'Discountable Component 23', value: 22 },
    { id: 'PRD-0024', name: 'Discountable Component 24', value: 23 },
    { id: 'PRD-0025', name: 'Discountable Component 25', value: 24 },
    { id: 'PRD-0026', name: 'Discountable Component 26', value: 25 },
    { id: 'PRD-0027', name: 'Discountable Component 27', value: 26 },
    { id: 'PRD-0028', name: 'Discountable Component 28', value: 27 },
    { id: 'PRD-0029', name: 'Discountable Component 29', value: 28 },
    { id: 'PRD-0030', name: 'Discountable Component 30', value: 29 },
    { id: 'PRD-0031', name: 'Discountable Component 31', value: 30 },
    { id: 'PRD-0032', name: 'Discountable Component 32', value: 31 },
    { id: 'PRD-0033', name: 'Discountable Component 33', value: 32 },
    { id: 'PRD-0034', name: 'Discountable Component 34', value: 33 },
    { id: 'PRD-0035', name: 'Discountable Component 35', value: 34 },
    { id: 'PRD-0036', name: 'Discountable Component 36', value: 35 },
    { id: 'PRD-0037', name: 'Discountable Component 37', value: 36 },
    { id: 'PRD-0038', name: 'Discountable Component 38', value: 37 },
    { id: 'PRD-0039', name: 'Discountable Component 39', value: 38 },
    { id: 'PRD-0040', name: 'Discountable Component 40', value: 39 },
    { id: 'PRD-0041', name: 'Discountable Component 41', value: 40 },
    { id: 'PRD-0042', name: 'Discountable Component 42', value: 41 },
    { id: 'PRD-0043', name: 'Discountable Component 43', value: 42 },
    { id: 'PRD-0044', name: 'Discountable Component 44', value: 43 },
    { id: 'PRD-0045', name: 'Discountable Component 45', value: 44 },
    { id: 'PRD-0046', name: 'Discountable Component 46', value: 45 },
    { id: 'PRD-0047', name: 'Discountable Component 47', value: 46 },
    { id: 'PRD-0048', name: 'Discountable Component 48', value: 47 },
    { id: 'PRD-0049', name: 'Discountable Component 49', value: 48 },
    { id: 'PRD-0050', name: 'Discountable Component 50', value: 49 },
    { id: 'PRD-0051', name: 'Discountable Component 51', value: 50 },
    { id: 'PRD-0052', name: 'Discountable Component 52', value: 51 },
    { id: 'PRD-0053', name: 'Discountable Component 53', value: 52 },
    { id: 'PRD-0054', name: 'Discountable Component 54', value: 53 },
    { id: 'PRD-0055', name: 'Discountable Component 55', value: 54 },
    { id: 'PRD-0056', name: 'Discountable Component 56', value: 55 },

    { id: 'PRD-0246', name: 'Discountable Component 246', value: 20 },
    { id: 'PRD-0247', name: 'Discountable Component 247', value: 21 },
    { id: 'PRD-0248', name: 'Discountable Component 248', value: 22 },
    { id: 'PRD-0249', name: 'Discountable Component 249', value: 23 },
    { id: 'PRD-0250', name: 'Discountable Component 250', value: 24 }
  ];

    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.max(0, limit);

    return discounts.slice(safeOffset, safeOffset + safeLimit);
}

// ---------------- INCENTIVES ----------------

export function getIncentive(limit: number, offset: number): ProductItem[] {
  const incentives: ProductItem[] = [
    { id: 'PRD-0001', name: 'Incentivized Component 1', value: 0 },
    { id: 'PRD-0002', name: 'Incentivized Component 2', value: 100 },
    { id: 'PRD-0003', name: 'Incentivized Component 3', value: 200 },
    { id: 'PRD-0004', name: 'Incentivized Component 4', value: 300 },
    { id: 'PRD-0005', name: 'Incentivized Component 5', value: 400 },
    { id: 'PRD-0006', name: 'Incentivized Component 6', value: 500 },
    { id: 'PRD-0007', name: 'Incentivized Component 7', value: 600 },
    { id: 'PRD-0008', name: 'Incentivized Component 8', value: 700 },
    { id: 'PRD-0009', name: 'Incentivized Component 9', value: 800 },
    { id: 'PRD-0010', name: 'Incentivized Component 10', value: 900 },
    { id: 'PRD-0011', name: 'Incentivized Component 11', value: 1000 },
    { id: 'PRD-0012', name: 'Incentivized Component 12', value: 1100 },
    { id: 'PRD-0013', name: 'Incentivized Component 13', value: 1200 },
    { id: 'PRD-0014', name: 'Incentivized Component 14', value: 1300 },
    { id: 'PRD-0015', name: 'Incentivized Component 15', value: 1400 },
    { id: 'PRD-0016', name: 'Incentivized Component 16', value: 1500 },
    { id: 'PRD-0017', name: 'Incentivized Component 17', value: 1600 },
    { id: 'PRD-0018', name: 'Incentivized Component 18', value: 1700 },
    { id: 'PRD-0019', name: 'Incentivized Component 19', value: 1800 },
    { id: 'PRD-0020', name: 'Incentivized Component 20', value: 1900 },
    { id: 'PRD-0021', name: 'Incentivized Component 21', value: 2000 },
    { id: 'PRD-0022', name: 'Incentivized Component 22', value: 2100 },
    { id: 'PRD-0023', name: 'Incentivized Component 23', value: 2200 },
    { id: 'PRD-0024', name: 'Incentivized Component 24', value: 2300 },
    { id: 'PRD-0025', name: 'Incentivized Component 25', value: 2400 },
    { id: 'PRD-0026', name: 'Incentivized Component 26', value: 2500 },
    { id: 'PRD-0027', name: 'Incentivized Component 27', value: 2600 },
    { id: 'PRD-0028', name: 'Incentivized Component 28', value: 2700 },
    { id: 'PRD-0029', name: 'Incentivized Component 29', value: 2800 },
    { id: 'PRD-0030', name: 'Incentivized Component 30', value: 2900 },
    { id: 'PRD-0031', name: 'Incentivized Component 31', value: 3000 },
    { id: 'PRD-0032', name: 'Incentivized Component 32', value: 3100 },
    { id: 'PRD-0033', name: 'Incentivized Component 33', value: 3200 },
    { id: 'PRD-0034', name: 'Incentivized Component 34', value: 3300 },
    { id: 'PRD-0035', name: 'Incentivized Component 35', value: 3400 },
    { id: 'PRD-0036', name: 'Incentivized Component 36', value: 3500 },
    { id: 'PRD-0037', name: 'Incentivized Component 37', value: 3600 },
    { id: 'PRD-0038', name: 'Incentivized Component 38', value: 3700 },
    { id: 'PRD-0039', name: 'Incentivized Component 39', value: 3800 },
    { id: 'PRD-0040', name: 'Incentivized Component 40', value: 3900 }, 
    { id: 'PRD-0041', name: 'Incentivized Component 41', value: 4000 },
    { id: 'PRD-0042', name: 'Incentivized Component 42', value: 4100 },
    { id: 'PRD-0043', name: 'Incentivized Component 43', value: 4200 },
    { id: 'PRD-0044', name: 'Incentivized Component 44', value: 4300 },
    { id: 'PRD-0045', name: 'Incentivized Component 45', value: 4400 },
    { id: 'PRD-0046', name: 'Incentivized Component 46', value: 4500 },
    { id: 'PRD-0047', name: 'Incentivized Component 47', value: 4600 },
    { id: 'PRD-0048', name: 'Incentivized Component 48', value: 4700 },
    { id: 'PRD-0049', name: 'Incentivized Component 49', value: 4800 },
    { id: 'PRD-0050', name: 'Incentivized Component 50', value: 4900 }, 
    { id: 'PRD-0051', name: 'Incentivized Component 51', value: 5000 },
    { id: 'PRD-0052', name: 'Incentivized Component 52', value: 5100 },
    { id: 'PRD-0053', name: 'Incentivized Component 53', value: 5200 },



    { id: 'PRD-0246', name: 'Incentivized Component 246', value: 4500 },
    { id: 'PRD-0247', name: 'Incentivized Component 247', value: 4600 },
    { id: 'PRD-0248', name: 'Incentivized Component 248', value: 4700 },
    { id: 'PRD-0249', name: 'Incentivized Component 249', value: 4800 },
    { id: 'PRD-0250', name: 'Incentivized Component 250', value: 4900 }
  ];

  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(0, limit);

  return incentives.slice(safeOffset, safeOffset + safeLimit);
}