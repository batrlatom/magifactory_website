import React, { useState, useEffect, useRef, useContext } from 'react';


import { BrowserRouter as Router, Routes, Route, Link, useParams, useNavigate, useLocation } from 'react-router-dom';

import { db, storage, auth } from './firebase';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, addDoc, query, where, orderBy, onSnapshot, increment } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { ArrowLeft, Twitter, Facebook, Share2, ThumbsUp, ShoppingCart } from 'lucide-react';


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

// Custom hook for real-time data fetching
const useRealtimeCollection = (collectionName, queryConstraints = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const collectionRef = collection(db, collectionName);
    const q = query(collectionRef, ...queryConstraints);

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setData(fetchedData);
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching ${collectionName}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, JSON.stringify(queryConstraints)]);

  return { data, loading, error };
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
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { trackEvent } = useAnalytics();
  const [products, setProducts] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);

  // Use the custom hook for real-time products fetching
  const { data: rawProducts, loading: productsLoading, error: productsError } = useRealtimeCollection('products');

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

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (rawProducts.length > 0) {
      fetchProductImages();
    }
  }, [rawProducts]);

  const fetchProductImages = async () => {
    const productsWithImages = await Promise.all(rawProducts.map(async (product) => {
      let imageUrl = '/placeholder-image.jpg';
      if (product.imagePath && typeof product.imagePath === 'string' && product.imagePath.trim() !== '') {
        try {
          const imageRef = ref(storage, product.imagePath.trim());
          imageUrl = await getDownloadURL(imageRef);
        } catch (error) {
          console.error(`Error fetching image URL for product ${product.id}:`, error);
        }
      } else {
        console.warn(`Invalid or missing imagePath for product ${product.id}`);
      }
      return { ...product, imageUrl };
    }));
    setProducts(productsWithImages);
  };

  const handleVote = async (productId) => {
    if (!user) {
      alert('Please log in to vote.');
      return;
    }

    const voteRef = doc(db, 'votes', `${user.uid}_${productId}`);
    const voteDoc = await getDoc(voteRef);

    if (voteDoc.exists()) {
      alert('You have already voted for this product.');
      return;
    }

    try {
      await updateDoc(doc(db, 'products', productId), {
        voteCount: increment(1)
      });

      await setDoc(voteRef, {
        userId: user.uid,
        productId: productId,
        timestamp: new Date()
      });

      trackEvent('product_vote', 'Product', productId);
    } catch (error) {
      console.error('Error voting for product:', error);
      alert('Failed to vote. Please try again.');
    }
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
        <Link to="/cart" className="flex items-center text-blue-500 hover:text-blue-700 mr-4">
          <ShoppingCart size={24} />
          {cart.length > 0 && <span className="ml-1">{cart.length}</span>}
        </Link>
          {user ? (
            <div className="flex items-center">
              <span className="mr-2">Welcome, {user.displayName}!</span>
              <button onClick={handleLogout} className="px-4 py-2 rounded">Logout</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="bg-blue-500 text-white px-4 py-2 rounded">Login</button>
          )}
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<LandingPage products={products} />} />
        <Route path="/product/:id" element={<ProductPage products={products} addToCart={addToCart} handleVote={handleVote} />} />
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

// ProductPage component
const ProductPage = ({ products, addToCart, handleVote, user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    const currentProduct = products.find(p => p.id === id);
    if (currentProduct) {
      setProduct(currentProduct);
    }
  }, [products, id]);

  useEffect(() => {
    const checkUserVote = async () => {
      if (user && product) {
        const voteDoc = await getDoc(doc(db, 'votes', `${user.uid}_${product.id}`));
        setHasVoted(voteDoc.exists());
      }
    };

    checkUserVote();
  }, [user, product]);

  if (!product) return <div>Product not found</div>;

  const shareUrl = `${window.location.origin}/product/${id}`;
  const shareText = `Check out this awesome product: ${product.name}`;



  const handleShare = async (platform) => {
    if (navigator.share && platform === 'native') {
      try {
        await navigator.share({
          title: product.name,
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      let url;
      switch (platform) {
        case 'twitter':
          url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
          break;
        case 'facebook':
          url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
          break;
        case 'whatsapp':
          url = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
          break;
        default:
          return;
      }
      window.open(url, '_blank');
    }
  };


  return (
    <div className="max-w-7xl mx-auto">
      <button
        onClick={() => navigate('/')}
        className="mb-4 flex items-center text-blue-500 hover:text-blue-700"
      >
        <ArrowLeft className="mr-2" size={20} />
        Back to Products
      </button>
      <div className="flex flex-col md:flex-row gap-8">
        <div className="md:w-1/2">
          <img src={product.imageUrl} alt={product.name} className="w-full h-auto object-contain rounded-lg shadow-md" />
        </div>

        <div className="md:w-1/2">
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <div className="md:w-1/3">

            <p className="text-gray-600 mb-4">{product.description}</p>
            <p className="text-2xl font-bold text-green-600 mb-4">${product.price.toFixed(2)}</p>

            <button
              onClick={() => {
                addToCart(product);
                navigate('/cart');
              }}
              className="w-full bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition duration-300 mb-6"
            >
              Add to Cart
            </button>

            {/* Improved voting block */}
            <div className="flex items-center space-x-4 mb-6 bg-gray-100 p-3 rounded-lg">
              <button
                onClick={() => handleVote(product.id)}
                className={`flex items-center justify-center px-4 py-2 rounded-full ${hasVoted ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-300 hover:bg-blue-500'
                  } text-white transition duration-300`}
                disabled={hasVoted}
              >
                <ThumbsUp className="mr-2" size={18} />
                {hasVoted ? 'Voted' : 'Vote'}
              </button>
              <span className="text-lg font-semibold">{product.voteCount || 0} votes</span>
            </div>



            {/* Improved sharing block */}
            <div className="mt-6">
              <p className="text-lg font-semibold mb-3">Share this product:</p>
              <div className="flex space-x-3">
                <button
                  onClick={() => handleShare('twitter')}
                  className="p-2 text-blue-600 rounded-full  transition duration-300"
                  aria-label="Share on Twitter"
                >
                  <Twitter size={20} />
                </button>
                <button
                  onClick={() => handleShare('facebook')}
                  className="p-2 text-blue-600 rounded-full  transition duration-300"
                  aria-label="Share on Facebook"
                >
                  <Facebook size={20} />
                </button>
                <button
                  onClick={() => handleShare('whatsapp')}
                  className="p-2  text-blue-600 rounded-full transition duration-300"
                  aria-label="Share on WhatsApp"
                >
                  <Share2 size={20} />
                </button>
                {navigator.share && (
                  <button
                    onClick={() => handleShare('native')}
                    className="p-2 bg-gray-500 text-white rounded-full  transition duration-300"
                    aria-label="Share"
                  >
                    <Share2 size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>



      </div>
    </div>
  );
};


const Cart = ({ cart, removeFromCart }) => {
  const navigate = useNavigate();
  const { trackEvent } = useAnalytics();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Cart</h1>
      {cart.length === 0 ? (
        <div>
          <p>Your cart is empty.</p>
          <Link to="/" className="bg-blue-500 text-white px-4 py-2 rounded mt-4 inline-block">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <>
          {/* ... (existing cart item rendering) */}
          <div className="mt-4">
            <p className="font-bold text-xl mb-4">
              Total: ${cart.reduce((total, item) => total + item.price, 0).toFixed(2)}
            </p>
            <div className="flex justify-between">
              <Link to="/" className="flex items-center text-blue-500 hover:text-blue-700">
                <ArrowLeft className="mr-2" size={20} />
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
        </>
      )}
    </div>
  );
};

/*
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

  
};*/


const europeanCountries = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
  "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
  "United Kingdom" // Included for shipping purposes
];

const allCountries = [...europeanCountries, "United States"].sort();

const Shipping = ({ saveShippingInfo, fetchUserInfo, trackEvent }) => {
  const navigate = useNavigate();
  const [shippingInfo, setShippingInfo] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    phoneNumber: '',
    shippingMethod: 'dpd_standard'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserInfo = async () => {
      const userInfo = await fetchUserInfo();
      if (userInfo && userInfo.shippingInfo) {
        setShippingInfo(prevState => ({ ...prevState, ...userInfo.shippingInfo }));
      }
      setLoading(false);
    };
    loadUserInfo();
  }, [fetchUserInfo]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setShippingInfo(prevState => ({ ...prevState, [name]: value }));
  };

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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Shipping Information</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block mb-1 font-medium">First Name</label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              className="w-full border rounded px-3 py-2"
              required
              value={shippingInfo.firstName}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block mb-1 font-medium">Last Name</label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              className="w-full border rounded px-3 py-2"
              required
              value={shippingInfo.lastName}
              onChange={handleChange}
            />
          </div>
        </div>
        <div>
          <label htmlFor="address" className="block mb-1 font-medium">Address</label>
          <input
            type="text"
            id="address"
            name="address"
            className="w-full border rounded px-3 py-2"
            required
            value={shippingInfo.address}
            onChange={handleChange}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="city" className="block mb-1 font-medium">City</label>
            <input
              type="text"
              id="city"
              name="city"
              className="w-full border rounded px-3 py-2"
              required
              value={shippingInfo.city}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="country" className="block mb-1 font-medium">Country</label>
            <select
              id="country"
              name="country"
              className="w-full border rounded px-3 py-2"
              required
              value={shippingInfo.country}
              onChange={handleChange}
            >
              <option value="">Select a country</option>
              {allCountries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="postalCode" className="block mb-1 font-medium">Postal Code</label>
            <input
              type="text"
              id="postalCode"
              name="postalCode"
              className="w-full border rounded px-3 py-2"
              required
              value={shippingInfo.postalCode}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="phoneNumber" className="block mb-1 font-medium">Phone Number</label>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              className="w-full border rounded px-3 py-2"
              required
              value={shippingInfo.phoneNumber}
              onChange={handleChange}
            />
          </div>
        </div>
        <div>
          <label htmlFor="shippingMethod" className="block mb-1 font-medium">Shipping Method</label>
          <select
            id="shippingMethod"
            name="shippingMethod"
            className="w-full border rounded px-3 py-2"
            required
            value={shippingInfo.shippingMethod}
            onChange={handleChange}
          >
            <option value="dpd_standard">DPD (3-5 business days)</option>
            <option value="dhl_standard">DHL (3-5 business days)</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
        >
          Proceed to Payment
        </button>
      </form>
    </div>
  );
};

const Payment = ({ savePaymentInfo, createOrder, fetchUserInfo, cart, trackEvent }) => {
  const navigate = useNavigate();
  const [paymentInfo, setPaymentInfo] = useState({
    cardholderName: '',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    billingAddress: {
      street: '',
      city: '',
      country: '',
      postalCode: ''
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserInfo = async () => {
      const userInfo = await fetchUserInfo();
      if (userInfo && userInfo.paymentInfo) {
        setPaymentInfo(prevState => ({ ...prevState, ...userInfo.paymentInfo }));
      }
      setLoading(false);
    };
    loadUserInfo();
  }, [fetchUserInfo]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('billing')) {
      const billingField = name.split('.')[1];
      setPaymentInfo(prevState => ({
        ...prevState,
        billingAddress: {
          ...prevState.billingAddress,
          [billingField]: value
        }
      }));
    } else {
      setPaymentInfo(prevState => ({ ...prevState, [name]: value }));
    }
  };

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
      navigate('/order-confirmation', { state: { orderId } });
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Payment Information</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="cardholderName" className="block mb-1 font-medium">Cardholder Name</label>
          <input
            type="text"
            id="cardholderName"
            name="cardholderName"
            className="w-full border rounded px-3 py-2"
            required
            value={paymentInfo.cardholderName}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="cardNumber" className="block mb-1 font-medium">Card Number</label>
          <input
            type="text"
            id="cardNumber"
            name="cardNumber"
            className="w-full border rounded px-3 py-2"
            required
            value={paymentInfo.cardNumber}
            onChange={handleChange}
            placeholder="1234 5678 9012 3456"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="expiryDate" className="block mb-1 font-medium">Expiry Date</label>
            <input
              type="text"
              id="expiryDate"
              name="expiryDate"
              className="w-full border rounded px-3 py-2"
              required
              value={paymentInfo.expiryDate}
              onChange={handleChange}
              placeholder="MM/YY"
            />
          </div>
          <div>
            <label htmlFor="cvv" className="block mb-1 font-medium">CVV</label>
            <input
              type="text"
              id="cvv"
              name="cvv"
              className="w-full border rounded px-3 py-2"
              required
              value={paymentInfo.cvv}
              onChange={handleChange}
              placeholder="123"
            />
          </div>
        </div>
        <h2 className="text-2xl font-bold mt-6 mb-4">Billing Address</h2>
        <div>
          <label htmlFor="billing.street" className="block mb-1 font-medium">Street Address</label>
          <input
            type="text"
            id="billing.street"
            name="billing.street"
            className="w-full border rounded px-3 py-2"
            required
            value={paymentInfo.billingAddress.street}
            onChange={handleChange}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="billing.city" className="block mb-1 font-medium">City</label>
            <input
              type="text"
              id="billing.city"
              name="billing.city"
              className="w-full border rounded px-3 py-2"
              required
              value={paymentInfo.billingAddress.city}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="billing.country" className="block mb-1 font-medium">Country</label>
            <input
              type="text"
              id="billing.country"
              name="billing.country"
              className="w-full border rounded px-3 py-2"
              required
              value={paymentInfo.billingAddress.country}
              onChange={handleChange}
            />
          </div>
        </div>
        <div>
          <label htmlFor="billing.postalCode" className="block mb-1 font-medium">Postal Code</label>
          <input
            type="text"
            id="billing.postalCode"
            name="billing.postalCode"
            className="w-full border rounded px-3 py-2"
            required
            value={paymentInfo.billingAddress.postalCode}
            onChange={handleChange}
          />
        </div>
        <div className="mt-6">
          <h2 className="text-2xl font-bold mb-4">Order Summary</h2>
          <div className="border-t border-b py-4">
            {cart.map((item, index) => (
              <div key={index} className="flex justify-between items-center mb-2">
                <span>{item.name}</span>
                <span>${item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center font-bold text-lg mt-4">
            <span>Total:</span>
            <span>${cart.reduce((total, item) => total + item.price, 0).toFixed(2)}</span>
          </div>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300 mt-6"
        >
          Complete Purchase
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