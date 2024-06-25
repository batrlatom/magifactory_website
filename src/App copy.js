import React, { useState } from 'react';
import './App.css';


// Mock data for products
const products = [
  { id: 1, name: 'Product 1', price: 19.99, description: 'This is product 1', image: 'http://127.0.0.1:7860/file=/tmp/gradio/74858240c09a478b9c7344badea90933a8cf1dfb/image.webp' },
  { id: 2, name: 'Product 2', price: 29.99, description: 'This is product 2', image: 'http://127.0.0.1:7860/file=/tmp/gradio/b5c8c41a6a26852f2f7b4c82a3058e3e0b697f9f/image.webp' },
  { id: 3, name: 'Product 3', price: 39.99, description: 'This is product 3', image: '/api/placeholder/300/200' },
];

// Main App component
const App = () => {
  const [cart, setCart] = useState([]);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const addToCart = (product) => {
    setCart([...cart, product]);
  };

  const navigateTo = (page, product = null) => {
    setCurrentPage(page);
    if (product) setSelectedProduct(product);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <ProductList products={products} navigateTo={navigateTo} />;
      case 'product':
        return <ProductPage product={selectedProduct} addToCart={addToCart} navigateTo={navigateTo} />;
      case 'cart':
        return <Cart cart={cart} navigateTo={navigateTo} />;
      case 'shipping':
        return <Shipping navigateTo={navigateTo} />;
      case 'payment':
        return <Payment navigateTo={navigateTo} />;
      default:
        return <ProductList products={products} navigateTo={navigateTo} />;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <nav className="mb-4">
        <ul className="flex space-x-4">
          <li><button onClick={() => navigateTo('home')} className="text-blue-500 hover:text-blue-700">Home</button></li>
          <li><button onClick={() => navigateTo('cart')} className="text-blue-500 hover:text-blue-700">Cart ({cart.length})</button></li>
        </ul>
      </nav>
      {renderPage()}
    </div>
  );
};

// ProductList component
const ProductList = ({ products, navigateTo }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {products.map((product) => (
      <div key={product.id} className="border p-4 rounded">

        <img src={product.image} alt={product.name} className="w-full h-auto object-contain mb-4" />
        <h2 className="text-xl font-bold">{product.name}</h2>
        <p className="text-gray-600">${product.price.toFixed(2)}</p>
        <button 
          onClick={() => navigateTo('product', product)} 
          className="mt-2 inline-block bg-blue-500 text-white px-4 py-2 rounded"
        >
          View Details
        </button>
      </div>
    ))}
  </div>
);

// ProductPage component
const ProductPage = ({ product, addToCart, navigateTo }) => {
  if (!product) return <div>Product not found</div>;

  return (
    <div className="flex flex-col md:flex-row">

      <img src={product.image} alt={product.name} className="w-full h-auto md:w-1/2 h-64 object-contain mb-4 md:mb-0 md:mr-4" />
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="text-xl text-gray-600 mb-2">${product.price.toFixed(2)}</p>
        <p className="mb-4">{product.description}</p>
        <button
          onClick={() => {
            addToCart(product);
            navigateTo('cart');
          }}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};

// Cart component
const Cart = ({ cart, navigateTo }) => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Cart</h1>
    {cart.map((item, index) => (
      <div key={index} className="flex justify-between items-center mb-2">
        <span>{item.name}</span>
        <span>${item.price.toFixed(2)}</span>
      </div>
    ))}
    <div className="mt-4">
      <button onClick={() => navigateTo('shipping')} className="bg-blue-500 text-white px-4 py-2 rounded">
        Proceed to Shipping
      </button>
    </div>
  </div>
);

// Shipping component
const Shipping = ({ navigateTo }) => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Shipping Information</h1>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); navigateTo('payment'); }}>
      <div>
        <label htmlFor="name" className="block mb-1">Name</label>
        <input type="text" id="name" className="w-full border rounded px-2 py-1" required />
      </div>
      <div>
        <label htmlFor="address" className="block mb-1">Address</label>
        <input type="text" id="address" className="w-full border rounded px-2 py-1" required />
      </div>
      <button type="submit" className="inline-block bg-blue-500 text-white px-4 py-2 rounded">
        Proceed to Payment
      </button>
    </form>
  </div>
);

// Payment component
const Payment = ({ navigateTo }) => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Payment Information</h1>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('Order placed successfully!'); navigateTo('home'); }}>
      <div>
        <label htmlFor="card" className="block mb-1">Card Number</label>
        <input type="text" id="card" className="w-full border rounded px-2 py-1" required />
      </div>
      <div>
        <label htmlFor="expiry" className="block mb-1">Expiry Date</label>
        <input type="text" id="expiry" className="w-full border rounded px-2 py-1" required />
      </div>
      <div>
        <label htmlFor="cvv" className="block mb-1">CVV</label>
        <input type="text" id="cvv" className="w-full border rounded px-2 py-1" required />
      </div>
      <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">
        Complete Order
      </button>
    </form>
  </div>
);

export default App;

