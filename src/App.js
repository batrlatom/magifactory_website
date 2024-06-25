import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';

import './App.css';

// Main App component
const App = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      const productsCollection = collection(db, 'products');
      const productsSnapshot = await getDocs(productsCollection);
      const productsList = await Promise.all(productsSnapshot.docs.map(async (doc) => {
        const data = doc.data();
        const imageUrl = await getDownloadURL(ref(storage, data.imageUrl));
        return {
          id: doc.id,
          ...data,
          imageUrl
        };
      }));
      setProducts(productsList);
    };

    fetchProducts();
  }, []);

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
      <nav className="mb-4 flex justify-between items-center">
        <button onClick={() => navigateTo('home')} className="text-blue-500 hover:text-blue-700 text-xl font-bold">
          Magifactory
        </button>
        <button onClick={() => navigateTo('cart')} className="text-blue-500 hover:text-blue-700">
          Cart ({cart.length})
        </button>
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
        <div
          onClick={() => navigateTo('product', product)}
          className="cursor-pointer"
        >
          <img src={product.imageUrl} alt={product.name} className="w-full h-auto object-cover mb-2" />
          <h2 className="text-xl font-bold">{product.name}</h2>
          <p className="text-gray-600">${product.price.toFixed(2)}</p>
        </div>
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
/*
const ProductList = ({ products, navigateTo }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {products.map((product) => (
      <div key={product.id} className="border p-4 rounded">
        <div
          onClick={() => navigateTo('product', product)}
          className="cursor-pointer"
        >
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-48 object-cover mb-2"
          />
          <h2 className="text-xl font-bold hover:text-blue-500">{product.name}</h2>
        </div>
        <p className="text-gray-600">${product.price.toFixed(2)}</p>
        <button
          onClick={() => navigateTo('product', product)}
          className="mt-2 inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          View Details
        </button>
      </div>
    ))}
  </div>
);
*/

const ProductPage = ({ product, addToCart, navigateTo }) => {
  if (!product) return <div>Product not found</div>;

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <div className="md:w-1/2">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-auto object-contain mb-4"
        />
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4].map((_, index) => (
            <div key={index} className="w-16 h-16 bg-gray-200"></div>
          ))}
        </div>
        <div className="bg-gray-200 w-full h-32 flex items-center justify-center">
          <span className="text-4xl">▶</span>
        </div>
      </div>
      <div className="md:w-1/2">
        <h1 className="text-5xl font-bold mb-2">{product.name}</h1>
        <div className="flex items-center mb-4">
          <div className="text-yellow-400">★★★★☆</div>
          <span className="ml-2 text-sm text-gray-500">4.0 (50 reviews)</span>
        </div>
        <p className="mb-4">{product.description}</p>
        <div className="flex items-center mb-4">
          <span className="text-3xl font-bold text-green-600 mr-2">${product.price.toFixed(2)}</span>
          <span className="text-lg line-through text-gray-500">${(product.price * 1.25).toFixed(2)}</span>
        </div>
        <button
          onClick={() => {
            addToCart(product);
            navigateTo('cart');
          }}
          className="bg-green-500 text-white px-6 py-3 rounded text-lg font-bold mb-4"
        >
          Add to Cart
        </button>
        <div className="text-sm text-gray-500">
          <p>Only 5 buys to unlock better price</p>
        </div>
        <button className="mt-4 text-blue-500">
          ♡ Add to Wish List
        </button>
        <div className="mt-4">
          <span className="mr-2">Share:</span>
          <button className="mr-2">f</button>
          <button className="mr-2">in</button>
          <button>t</button>
        </div>
      </div>
    </div>
  );
};

// Cart component
const Cart = ({ cart, navigateTo }) => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Cart</h1>
    {cart.length === 0 ? (
      <p>Your cart is empty.</p>
    ) : (
      <>
        {cart.map((item, index) => (
          <div key={index} className="flex justify-between items-center mb-2">
            <span>{item.name}</span>
            <span>${item.price.toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-4">
          <button
            onClick={() => navigateTo('shipping')}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Proceed to Checkout
          </button>
        </div>
      </>
    )}
  </div>
);

// Shipping and Payment components remain the same

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