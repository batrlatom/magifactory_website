import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, storage, auth } from './firebase';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, addDoc, query, where, orderBy } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

import './App.css';

// Custom hook for Google Analytics tracking
const useAnalytics = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);

  const trackEvent = (action, category, label, value) => {
    if (window.gtag) {
      window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
      });
    }
  };

  return { trackEvent };
};

// Main App component
const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

// AppContent component (wrapped by Router)
const AppContent = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { trackEvent } = useAnalytics();

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
    trackEvent('add_to_cart', 'Ecommerce', product.name, product.price);
  };

  const removeFromCart = async (index) => {
    const removedItem = cart[index];
    const updatedCart = cart.filter((_, i) => i !== index);
    await updateCart(updatedCart);
    trackEvent('remove_from_cart', 'Ecommerce', removedItem.name, removedItem.price);
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
      trackEvent('login', 'User', 'Google Login');
    } catch (error) {
      console.error("Error signing in: ", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCart([]);
      localStorage.removeItem('sessionCart');
      trackEvent('logout', 'User', 'User Logout');
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const saveShippingInfo = async (shippingInfo) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { shippingInfo }, { merge: true });
    } else {
      console.log('No user logged in. Shipping info not saved.');
    }
  };

  const savePaymentInfo = async (paymentInfo) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { paymentInfo }, { merge: true });
    } else {
      console.log('No user logged in. Payment info not saved.');
    }
  };

  const fetchUserInfo = async () => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return userSnap.data();
      }
    }
    return null;
  };


  const fetchUserOrders = async () => {
    if (user) {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return [];
  };


  const createOrder = async (orderDetails) => {
    if (user) {
      const orderRef = await addDoc(collection(db, 'orders'), {
        userId: user.uid,
        ...orderDetails,
        createdAt: new Date()
      });
      return orderRef.id;
    }
    return null;
  };


  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <nav className="mb-4 flex justify-between items-center">
        <Link to="/" className="text-blue-500 hover:text-blue-700 text-xl font-bold">
        <img src="/logo.svg" alt="MagiFactory" className="h-8 w-auto" />

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
      <Route path="/" element={<LandingPage products={products} />} />
        <Route path="/product/:id" element={<ProductPage products={products} addToCart={addToCart} />} />
        <Route path="/cart" element={<Cart cart={cart} removeFromCart={removeFromCart} />} />
           <Route path="/" element={<LandingPage products={products} />} />

        <Route path="/shipping" element={<Shipping saveShippingInfo={saveShippingInfo} fetchUserInfo={fetchUserInfo} trackEvent={trackEvent} />} />
        <Route path="/payment" element={<Payment updateCart={updateCart} savePaymentInfo={savePaymentInfo} createOrder={createOrder} fetchUserInfo={fetchUserInfo} cart={cart} trackEvent={trackEvent} />} />
        <Route path="/orders" element={<OrderHistory fetchUserOrders={fetchUserOrders} />} />

      </Routes>
    </div>
  );
};

const LandingPage = ({ products }) => {
  const productListRef = useRef(null);

  const scrollToProducts = () => {
    productListRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <HeroSection scrollToProducts={scrollToProducts} />
      <ProductGrid products={products} ref={productListRef} />
    </div>
  );
};

const HeroSection = ({ scrollToProducts }) => {
  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex items-center">
        <div className="w-1/2 pr-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Bring AI-designed t-shirts to life with MagiFactory</h1>
          <p className="text-xl text-gray-600 mb-6">Our AI bot creates a unique t-shirt design every minute. Team up with friends to vote on your favorites and turn virtual designs into real, wearable art. Join the AI fashion revolution today!</p>
          <button 
            onClick={scrollToProducts}
            className="bg-blue-600 text-white px-6 py-3 rounded-md text-lg font-semibold hover:bg-blue-700 transition duration-300"
          >
            GET STARTED
          </button>
        </div>
        <div className="w-1/2">
          <img src="https://www.magifactory.com/tshirt.jpg" alt="Custom T-shirt design" className="w-full rounded-lg shadow-lg" />
        </div>
      </div>
    </div>
  );
};

const ProductGrid = React.forwardRef(({ products }, ref) => {
  return (
    <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {products.map((product) => (
          <Link key={product.id} to={`/product/${product.id}`} className="block">
            <div className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition duration-300">
              <img src={product.imageUrl} alt={product.name} className="w-full h-64 object-cover" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
});

const ProductPage = ({ products, addToCart }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trackEvent } = useAnalytics();
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
  const { trackEvent } = useAnalytics();

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
          <Link
            to="/shipping"
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={() => trackEvent('begin_checkout', 'Ecommerce', 'Begin Checkout', cart.reduce((total, item) => total + item.price, 0))}
          >
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </div>
  );
};

const Shipping = ({ saveShippingInfo, fetchUserInfo, trackEvent }) => {
  const navigate = useNavigate();
  const [shippingInfo, setShippingInfo] = useState({ name: '', address: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserInfo = async () => {
      const userInfo = await fetchUserInfo();
      if (userInfo && userInfo.shippingInfo) {
        setShippingInfo(userInfo.shippingInfo);
      }
      setLoading(false);
    };
    loadUserInfo();
  }, [fetchUserInfo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await saveShippingInfo(shippingInfo);
      trackEvent('add_shipping_info', 'Ecommerce', 'Add Shipping Info');
      navigate('/payment');
    } catch (error) {
      console.error('Error saving shipping info:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Shipping Information</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name" className="block mb-1">Name</label>
          <input
            type="text"
            id="name"
            className="w-full border rounded px-2 py-1"
            required
            value={shippingInfo.name}
            onChange={(e) => setShippingInfo({...shippingInfo, name: e.target.value})}
          />
        </div>
        <div>
          <label htmlFor="address" className="block mb-1">Address</label>
          <input
            type="text"
            id="address"
            className="w-full border rounded px-2 py-1"
            required
            value={shippingInfo.address}
            onChange={(e) => setShippingInfo({...shippingInfo, address: e.target.value})}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Proceed to Payment
        </button>
      </form>
    </div>
  );
};

const Payment = ({ updateCart, savePaymentInfo, createOrder, fetchUserInfo, cart, trackEvent }) => {
  const navigate = useNavigate();
  const [paymentInfo, setPaymentInfo] = useState({ cardNumber: '', expiryDate: '', cvv: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserInfo = async () => {
      const userInfo = await fetchUserInfo();
      if (userInfo && userInfo.paymentInfo) {
        setPaymentInfo(userInfo.paymentInfo);
      }
      setLoading(false);
    };
    loadUserInfo();
  }, [fetchUserInfo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await savePaymentInfo(paymentInfo);
      const orderDetails = {
        items: cart,
        total: cart.reduce((total, item) => total + item.price, 0),
        status: 'pending'
      };
      const orderId = await createOrder(orderDetails);
      trackEvent('purchase', 'Ecommerce', 'Purchase Complete', orderDetails.total);
      alert(`Order placed successfully! Order ID: ${orderId}`);
      updateCart([]);
      navigate('/');
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Payment Information</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="cardNumber" className="block mb-1">Card Number</label>
          <input
            type="text"
            id="cardNumber"
            className="w-full border rounded px-2 py-1"
            required
            value={paymentInfo.cardNumber}
            onChange={(e) => setPaymentInfo({...paymentInfo, cardNumber: e.target.value})}
          />
        </div>
        <div>
          <label htmlFor="expiryDate" className="block mb-1">Expiry Date</label>
          <input
            type="text"
            id="expiryDate"
            className="w-full border rounded px-2 py-1"
            required
            value={paymentInfo.expiryDate}
            onChange={(e) => setPaymentInfo({...paymentInfo, expiryDate: e.target.value})}
          />
        </div>
        <div>
          <label htmlFor="cvv" className="block mb-1">CVV</label>
          <input
            type="text"
            id="cvv"
            className="w-full border rounded px-2 py-1"
            required
            value={paymentInfo.cvv}
            onChange={(e) => setPaymentInfo({...paymentInfo, cvv: e.target.value})}
          />
        </div>
        <button
          type="submit"
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Complete Order
        </button>
      </form>
    </div>
  );
};

const OrderHistory = ({ fetchUserOrders }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      const userOrders = await fetchUserOrders();
      setOrders(userOrders);
      setLoading(false);
    };
    loadOrders();
  }, [fetchUserOrders]);

  if (loading) {
    return <div>Loading orders...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Order History</h1>
      {orders.length === 0 ? (
        <p>You haven't placed any orders yet.</p>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="border p-4 mb-4 rounded">
            <h2 className="text-xl font-bold">Order ID: {order.id}</h2>
            <p>Date: {new Date(order.createdAt.seconds * 1000).toLocaleDateString()}</p>
            <p>Status: {order.status}</p>
            <p>Total: ${order.total.toFixed(2)}</p>
            <h3 className="font-bold mt-2">Items:</h3>
            <ul>
              {order.items.map((item, index) => (
                <li key={index}>{item.name} - ${item.price.toFixed(2)}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
};

export default App;