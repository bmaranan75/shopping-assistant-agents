// Grocery store product catalog with 20 sample grocery items
export interface Product {
  id: string;
  price: number;
  category: string;
  inStock: boolean;
}

export const PRODUCT_CATALOG: Product[] = [
  {
    id: "apple",
    price: 3.99,
    category: "Produce",
    inStock: true
  },
  {
    id: "banana",
    price: 1.29,
    category: "Produce",
    inStock: true
  },
  {
    id: "carrots",
    price: 2.49,
    category: "Produce",
    inStock: true
  },
  {
    id: "milk",
    price: 4.19,
    category: "Dairy",
    inStock: true
  },
  {
    id: "cheese",
    price: 5.99,
    category: "Dairy",
    inStock: true
  }
];

// Helper function to find product by code or name
export function findProduct(identifier: string): Product | null {
  const searchTerm = identifier.toLowerCase().trim();
  console.log(`[product-catalog] Finding product with identifier: ${searchTerm}`);
  // First try to find by exact code match
  let product = PRODUCT_CATALOG.find(p => p.id.toLowerCase() === searchTerm);
  
  // If not found by code, try to find by name (partial match)
  // if (!product) {
  //   product = PRODUCT_CATALOG.find(p => 
  //     p.name.toLowerCase().includes(searchTerm) || 
  //     searchTerm.includes(p.name.toLowerCase())
  //   );
  // }
  
  return product || null;
}

// Helper function to get all products
export function getAllProducts(): Product[] {
  return PRODUCT_CATALOG;
}

// Helper function to get products by category
export function getProductsByCategory(category: string): Product[] {
  return PRODUCT_CATALOG.filter(p => 
    p.category.toLowerCase() === category.toLowerCase()
  );
}

// Helper function to search products
export function searchProducts(query: string): Product[] {
  const searchTerm = query.toLowerCase().trim();
  console.log(`[product-catalog] Searching products with query: ${searchTerm}`);
  
  return PRODUCT_CATALOG.filter(p => 
    // p.name.toLowerCase().includes(searchTerm) ||
    // Remove this line - description doesn't exist in Product interface
    // p.description.toLowerCase().includes(searchTerm) ||
    p.category.toLowerCase().includes(searchTerm) ||
    p.id.toLowerCase().includes(searchTerm)
  );
}
