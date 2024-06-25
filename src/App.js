import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { db, storage, auth } from './firebase';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

import './App.css';

// Main App component
const App = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserCart(currentUser.uid);
      } else {
        fetchSessionCart();
      }
      setLoading(false);
    });

    fetchProducts();

    return () => unsubscribe();
  }, []);

  const fetchProducts = async () => {
    const productsCollection = collection(db, 'products');
    const productsSnapshot = await getDocs(productsCollection);
    const productsList = await Promise.all(productsSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      let imageUrl = '/placeholder-image.jpg';
      if (data.imagePath && typeof data.imagePath === 'string' && data.imagePath.trim() !== '') {
        try {
          const imageRef = ref(storage, data.imagePath.trim());
          imageUrl = await getDownloadURL(imageRef);
        } catch (error) {
          console.error(`Error fetching image URL for product ${doc.id}:`, error);
        }
      } else {
        console.warn(`Invalid or missing imagePath for product ${doc.id}`);
      }
      return {
        id: doc.id,
        ...data,
        imageUrl
      };
    }));
    setProducts(productsList);
  };

  const fetchUserCart = async (userId) => {
    const userCartRef = doc(db, 'carts', userId);
    const userCartSnapshot = await getDoc(userCartRef);
    if (userCartSnapshot.exists()) {
      setCart(userCartSnapshot.data().items);
    } else {
      const sessionCart = JSON.parse(localStorage.getItem('sessionCart') || '[]');
      setCart(sessionCart);
      await setDoc(userCartRef, { items: sessionCart });
      localStorage.removeItem('sessionCart');
    }
  };

  const fetchSessionCart = () => {
    const sessionCart = JSON.parse(localStorage.getItem('sessionCart') || '[]');
    setCart(sessionCart);
  };

  const addToCart = async (product) => {
    const updatedCart = [...cart, product];
    await updateCart(updatedCart);
  };

  const removeFromCart = async (index) => {
    const updatedCart = cart.filter((_, i) => i !== index);
    await updateCart(updatedCart);
  };

  const updateCart = async (updatedCart) => {
    setCart(updatedCart);
    if (user) {
      const userCartRef = doc(db, 'carts', user.uid);
      await updateDoc(userCartRef, { items: updatedCart });
    } else {
      localStorage.setItem('sessionCart', JSON.stringify(updatedCart));
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in: ", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCart([]);
      localStorage.removeItem('sessionCart');
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="container mx-auto p-4">
        <nav className="mb-4 flex justify-between items-center">
          <Link to="/" className="text-blue-500 hover:text-blue-700 text-xl font-bold">
            Magifactory
          </Link>
          <div className="flex items-center">
            <Link to="/cart" className="text-blue-500 hover:text-blue-700 mr-4">
              Cart ({cart.length})
            </Link>
            {user ? (
              <div className="flex items-center">
                <span className="mr-2">Welcome, {user.displayName}!</span>
                <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded">Logout</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="bg-blue-500 text-white px-4 py-2 rounded">Login</button>
            )}
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<ProductList products={products} />} />
          <Route path="/product/:id" element={<ProductPage products={products} addToCart={addToCart} />} />
          <Route path="/cart" element={<Cart cart={cart} removeFromCart={removeFromCart} />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/payment" element={<Payment updateCart={updateCart} />} />
        </Routes>
      </div>
    </Router>
  );
};

const ProductList = ({ products }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {products.map((product) => (
      <div key={product.id} className="border p-4 rounded">
        <Link to={`/product/${product.id}`} className="cursor-pointer">
          <img src={product.imageUrl} alt={product.name} className="w-full h-auto object-cover mb-2" />
          <h2 className="text-xl font-bold">{product.name}</h2>
          <p className="text-gray-600">${product.price.toFixed(2)}</p>
        </Link>
      </div>
    ))}
  </div>
);

const ProductPage = ({ products, addToCart }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const product = products.find(p => p.id === id);

  if (!product) return <div>Product not found</div>;

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <div className="md:w-1/2">
        <img src={product.imageUrl} alt={product.name} className="w-full h-auto object-contain mb-4" />
      </div>
      <div className="md:w-1/2">
        <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
        <p className="mb-4">{product.description}</p>
        <p className="text-2xl font-bold text-green-600 mb-4">${product.price.toFixed(2)}</p>
        <button
          onClick={() => {
            addToCart(product);
            navigate('/cart');
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};

const Cart = ({ cart, removeFromCart }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (cart.length === 0) {
      navigate('/');
    }
  }, [cart, navigate]);

  if (cart.length === 0) {
    return null;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Cart</h1>
      {cart.map((item, index) => (
        <div key={index} className="flex items-center mb-4 border-b pb-2">
          <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover mr-4" />
          <div className="flex-grow">
            <h3 className="font-bold">{item.name}</h3>
            <p className="text-gray-600">${item.price.toFixed(2)}</p>
          </div>
          <button 
            onClick={() => removeFromCart(index)}
            className="bg-red-500 text-white px-2 py-1 rounded"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="mt-4">
        <p className="font-bold text-xl mb-4">
          Total: ${cart.reduce((total, item) => total + item.price, 0).toFixed(2)}
        </p>
        <div className="flex justify-between">
          <Link to="/" className="bg-gray-500 text-white px-4 py-2 rounded">
            Continue Shopping
          </Link>
          <Link to="/shipping" className="bg-blue-500 text-white px-4 py-2 rounded">
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </div>
  );
};

const Shipping = () => (
  <div>
    <h1 className="text-2xl font-bold mb-4">Shipping Information</h1>
    <form className="space-y-4">
      <div>
        <label htmlFor="name" className="block mb-1">Name</label>
        <input type="text" id="name" className="w-full border rounded px-2 py-1" required />
      </div>
      <div>
        <label htmlFor="address" className="block mb-1">Address</label>
        <input type="text" id="address" className="w-full border rounded px-2 py-1" required />
      </div>
      <Link to="/payment" className="inline-block bg-blue-500 text-white px-4 py-2 rounded">
        Proceed to Payment
      </Link>
    </form>
  </div>
);

const Payment = ({ updateCart }) => {
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Order placed successfully!');
    updateCart([]);
    navigate('/');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Payment Information</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
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
};

export default App;