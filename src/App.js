import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { BrowserRouter as Router, Routes, Route, Link, useParams, useNavigate, useLocation } from 'react-router-dom';

import { db, storage, auth } from './firebase';
import { getCountFromServer, collection, getDocs, doc, setDoc, getDoc, updateDoc, addDoc, query, where, orderBy, onSnapshot, increment, startAfter, limit } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { ArrowLeft, Twitter, Facebook, Share2, ThumbsUp, ShoppingCart } from 'lucide-react';
import { CheckCircle, Package, Truck, ArrowLeftCircle, ArrowRightCircle } from 'lucide-react';

import './App.css';
import enTranslations from './locales/en.json';
import csTranslations from './locales/cs.json';


const LastViewedProductContext = React.createContext();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      cs: { translation: csTranslations },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

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
  const { t } = useTranslation();

  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { trackEvent } = useAnalytics();
  const [products, setProducts] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);

  const [lastViewedProductId, setLastViewedProductId] = useState(null);
  const changeLanguage = (lng) => {
    i18n.changeLanguage('cs');
  };



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

  const clearCart = () => {
    setCart([]);
    if (user) {
      const userCartRef = doc(db, 'carts', user.uid);
      updateDoc(userCartRef, { items: [] });
    } else {
      localStorage.removeItem('sessionCart');
    }
  };



  const handleVote = async (productId) => {
    if (!user) {
      alert(t('voting.loginRequired'));
      return;
    }

    const voteRef = doc(db, 'votes', `${user.uid}_${productId}`);
    const voteDoc = await getDoc(voteRef);

    if (voteDoc.exists()) {
      alert(t('voting.alreadyVoted'));
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
      alert(t('voting.voteFailed'));
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
    return <div>{t('loading')}</div>;
  }

  return (

    <LastViewedProductContext.Provider value={{ lastViewedProductId, setLastViewedProductId }}>

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
                <span className="mr-2">{t('navbar.welcome', { name: user.displayName })}</span>

                <Link to="/orders" className="flex items-center text-blue-500 hover:text-blue-700 mr-4">
                  <span>{t('navbar.yourOrders')}</span></Link>

                <button onClick={handleLogout} className="px-4 py-2 rounded">{t('navbar.logout')}</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="bg-blue-500 text-white px-4 py-2 rounded">{t('navbar.login')}</button>

            )}
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<LandingPage products={products} />} />
          <Route path="/product/:id" element={<ProductPage products={products} addToCart={addToCart} handleVote={handleVote} />} />
          <Route path="/cart" element={<Cart cart={cart} removeFromCart={removeFromCart} />} />
          <Route path="/" element={<LandingPage products={products} />} />

          <Route path="/shipping" element={<Shipping saveShippingInfo={saveShippingInfo} fetchUserInfo={fetchUserInfo} trackEvent={trackEvent} />} />
          <Route path="/payment" element={<Payment updateCart={updateCart} savePaymentInfo={savePaymentInfo} createOrder={createOrder} fetchUserInfo={fetchUserInfo} cart={cart} trackEvent={trackEvent} clearCart={clearCart} />} />
          <Route path="/orders" element={<OrderHistory fetchUserOrders={fetchUserOrders} />} />
          <Route path="/order-confirmation" element={<OrderConfirmation />} />
        </Routes>
      </div>
    </LastViewedProductContext.Provider>
  );
};




const HeroSection = ({ scrollToProducts }) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex items-center">
        <div className="w-1/2 pr-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('hero.title')}</h1>
          <p className="text-xl text-gray-600 mb-6">{t('hero.description')}</p>
          <button
            onClick={scrollToProducts}
            className="bg-blue-600 text-white px-6 py-3 rounded-md text-lg font-semibold hover:bg-blue-700 transition duration-300"
          >
            {t('hero.cta')}
          </button>
        </div>
        <div className="w-1/2">
          <img src="https://www.magifactory.com/tshirt.jpg" alt="Custom T-shirt design" className="w-full rounded-lg shadow-lg" />
        </div>
      </div>
    </div>
  );
};


const LandingPage = () => {

  const { t } = useTranslation();


  const [products, setProducts] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const observer = useRef();
  const productListRef = useRef(null);
  const { lastViewedProductId } = useContext(LastViewedProductContext);
  const productRefs = useRef({});
  const loadedIds = useRef(new Set());
  const isInitialMount = useRef(true);

  const loadMoreProducts = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);

    try {
      const productsRef = collection(db, 'products');
      const q = lastDoc
        ? query(productsRef, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(10))
        : query(productsRef, orderBy('timestamp', 'desc'), limit(10));

      const querySnapshot = await getDocs(q);

      const newProducts = await Promise.all(
        querySnapshot.docs.map(async (doc) => {
          if (loadedIds.current.has(doc.id)) return null;

          const data = doc.data();
          let imageUrl = '/placeholder-image.jpg';
          if (data.imagePath && typeof data.imagePath === 'string' && data.imagePath.trim() !== '') {
            try {
              const imageRef = ref(storage, data.imagePath.trim());
              imageUrl = await getDownloadURL(imageRef);
            } catch (error) {
              console.error(`Error fetching image URL for product ${doc.id}:`, error);
            }
          }
          loadedIds.current.add(doc.id);
          return { id: doc.id, ...data, imageUrl };
        })
      );

      const filteredNewProducts = newProducts.filter(Boolean);

      if (filteredNewProducts.length > 0) {
        setProducts(prevProducts => {
          const updatedProducts = [...prevProducts];
          filteredNewProducts.forEach(product => {
            if (!updatedProducts.some(p => p.id === product.id)) {
              updatedProducts.push(product);
            }
          });
          return updatedProducts;
        });
        setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more products:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [lastDoc, loading, hasMore]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadMoreProducts();
    }
  }, [loadMoreProducts]);

  useEffect(() => {
    if (lastViewedProductId && productRefs.current[lastViewedProductId]) {
      setTimeout(() => {
        productRefs.current[lastViewedProductId]?.scrollIntoView({
          behavior: 'instant',
          block: 'center',
        });
      }, 100);
    }
  }, [lastViewedProductId, products]);

  const lastProductRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMoreProducts();
      }
    });
    if (node) observer.current.observe(node);
  }, [loadMoreProducts, hasMore, loading]);

  const scrollToProducts = () => {
    productListRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <HeroSection scrollToProducts={scrollToProducts} />
      {error && <div className="text-center py-4 text-red-500">{error}</div>}
      <ProductGrid
        products={products}
        productListRef={productListRef}
        productRefs={productRefs}
        lastProductRef={lastProductRef}
      />
      {loading && <div className="text-center py-4">{t('product.loadingMore')}</div>}
      {!loading && !hasMore && products.length > 0 && <div className="text-center py-4"></div>}
      {!loading && !hasMore && products.length === 0 && <div className="text-center py-4">{t('product.noProducts')}</div>}

    </div>
  );
};

const ProductGrid = React.memo(({ products, productListRef, productRefs, lastProductRef }) => {
  const { t } = useTranslation();

  return (
    <div ref={productListRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {products.map((product, index) => (
          <Link
            key={product.id}
            to={`/product/${product.id}`}
            className="block"
            ref={el => {
              productRefs.current[product.id] = el;
              if (index === products.length - 1) {
                lastProductRef(el);
              }
            }}
          >
            <div className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition duration-300">
              {product.tryons && product.tryons.length > 0 ? (
                <img
                  src={product.tryons[0].public_url}
                  alt={product.name}
                  className="w-full h-128 object-contain"
                />
              ) : (
                <div className="w-full h-64 bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500">{t('product.noImageAvailable')}</span>
                </div>
              )}

            </div>
          </Link>
        ))}
      </div>
    </div>
  );
});

const ProductPage = ({ products, addToCart, handleVote }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const { setLastViewedProductId } = useContext(LastViewedProductContext);
  const { t } = useTranslation();

  useEffect(() => {
    const currentProduct = products.find(p => p.id === id);
    if (currentProduct) {
      setProduct(currentProduct);
      setLastViewedProductId(currentProduct.id);
    }
  }, [products, id, setLastViewedProductId]);

  if (!product) return <div className="flex justify-center items-center h-screen">{t('loading')}</div>;

  const shareUrl = `${window.location.origin}/product/${id}`;
  const shareText = t('product.shareText', { productName: product.name });

  const handleShare = async (platform) => {
    // ... (existing share functionality)
  };

  const handleVoteClick = () => {
    if (!hasVoted) {
      handleVote(product.id);
      setHasVoted(true);
    }
  };

  // Combine all images into a single array
  const allImages = [
    ...product.tryons,
    { public_url: product.processed_garment.public_url, type: 'processed_garment' },
    { public_url: product.original_logo.public_url, type: 'original_logo' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link to="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 transition duration-300">
        <ArrowLeft className="mr-2" size={20} />
        {t('product.backToProducts')}
      </Link>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="lg:w-3/5 flex flex-row">
          {/* Thumbnails */}
          <div className="flex flex-col space-y-2 mr-4">
            {allImages.map((image, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`w-20 h-20 rounded-md overflow-hidden transition-all duration-300 ${
                  currentImageIndex === index ? 'ring-2 ring-blue-500 shadow-md' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={image.public_url}
                  alt={`${product.name} thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>

          {/* Main Image */}
          <div className="flex-grow relative rounded-lg overflow-hidden shadow-lg">
            <img
              src={allImages[currentImageIndex].public_url}
              alt={`${product.name} - View ${currentImageIndex + 1}`}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>

        <div className="lg:w-1/3">
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <p className="text-2xl font-semibold text-green-600 mb-4">
            {t('product.price', { symbol: t('currency.symbol'), amount: product.price.toFixed(2) })}
          </p>
          <p className="text-gray-600 mb-6">{product.description}</p>

          <button
            onClick={() => {
              addToCart(product);
              navigate('/cart');
            }}
            className="w-full bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition duration-300 mb-8 flex items-center justify-center"
          >
            <ShoppingCart className="mr-2" size={20} />
            {t('product.addToCart')}
          </button>

          <div className="flex justify-between items-center mt-6">
            <button
              onClick={handleVoteClick}
              className={`flex items-center text-base ${
                hasVoted ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
              } transition duration-300`}
            >
              <ThumbsUp className="mr-2" size={20} />
              <span className="font-semibold">
                {t('product.voteCount', { count: product.voteCount || 0 })}
              </span>
            </button>

            <div className="flex space-x-3">
              {['twitter', 'facebook', 'whatsapp'].map((platform) => (
                <button
                  key={platform}
                  onClick={() => handleShare(platform)}
                  className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition duration-300"
                  aria-label={`Share on ${platform}`}
                >
                  {platform === 'twitter' && <Twitter size={20} />}
                  {platform === 'facebook' && <Facebook size={20} />}
                  {platform === 'whatsapp' && <Share2 size={20} />}
                </button>
              ))}
              {navigator.share && (
                <button
                  onClick={() => handleShare('native')}
                  className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition duration-300"
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
  );
};

const Cart = ({ cart, removeFromCart }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const total = cart.reduce((total, item) => total + item.price, 0);

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{t('cart.title')}</h1>

      <Link to="/" className="flex items-center text-blue-500 hover:text-blue-700 mb-6">
        <ArrowLeft className="mr-2" size={20} />
        {t('cart.continueShopping')}
      </Link>

      {cart.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">{t('cart.empty')}</h2>
          <p className="text-gray-600 mb-6">{t('cart.emptyMessage')}</p>
          <Link
            to="/"
            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition duration-300"
          >
            {t('cart.startShopping')}
          </Link>
        </div>
      ) : (
        <>
          {cart.map((item, index) => (
            <div key={index} className="flex items-center mb-4 pb-4 border-b">
              <img 
                src={item.processed_garment.public_url} 
                alt={item.name} 
                className="w-20 h-20 object-cover mr-4 rounded"
              />
              <div className="flex-grow">
                <h3 className="font-bold">{item.name}</h3>
                <p className="text-gray-600">
                  {t('product.price', {
                    symbol: t('currency.symbol'),
                    amount: item.price.toFixed(2)
                  })}
                </p>
              </div>
              <button
                onClick={() => removeFromCart(index)}
                className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition duration-300"
              >
                {t('cart.remove')}
              </button>
            </div>
          ))}

          <div className="mt-6 pt-4 border-t">
            <p className="font-bold text-xl mb-4">
              {t('cart.total')}: {t('product.price', {
                symbol: t('currency.symbol'),
                amount: total.toFixed(2)
              })}
            </p>
            <Link
              to="/shipping"
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300 inline-block text-center"
            >
              {t('cart.proceedToCheckout')}
            </Link>
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


  return (
    <div>
      <div className="mt-4">

        <div className="flex justify-between">
          <Link to="/" className="flex items-center text-blue-500 hover:text-blue-700">
            <ArrowLeft className="mr-2" size={20} />
            Continue Shopping
          </Link>

        </div>
      </div>

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
*/

const europeanCountries = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
  "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
  "United Kingdom" // Included for shipping purposes
];

const allCountries = [...europeanCountries, "United States"].sort();




const Shipping = ({ saveShippingInfo, fetchUserInfo }) => {
  const { t } = useTranslation();
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
      navigate('/payment');
    } catch (error) {
      console.error('Error saving shipping info:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t('loading')}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{t('shipping.title')}</h1>

      <button onClick={() => navigate('/cart')} className="flex items-center text-blue-500 hover:text-blue-700 mb-6">
        <ArrowLeft className="mr-2" size={20} />
        {t('shipping.backToCart')}
      </button>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block mb-1 font-medium">{t('shipping.firstName')}</label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={shippingInfo.firstName}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block mb-1 font-medium">{t('shipping.lastName')}</label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={shippingInfo.lastName}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="address" className="block mb-1 font-medium">{t('shipping.address')}</label>
          <input
            type="text"
            id="address"
            name="address"
            value={shippingInfo.address}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="city" className="block mb-1 font-medium">{t('shipping.city')}</label>
            <input
              type="text"
              id="city"
              name="city"
              value={shippingInfo.city}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="postalCode" className="block mb-1 font-medium">{t('shipping.postalCode')}</label>
            <input
              type="text"
              id="postalCode"
              name="postalCode"
              value={shippingInfo.postalCode}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="country" className="block mb-1 font-medium">{t('shipping.country')}</label>
          <select
            id="country"
            name="country"
            value={shippingInfo.country}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="">{t('shipping.selectCountry')}</option>
            {allCountries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="phoneNumber" className="block mb-1 font-medium">{t('shipping.phoneNumber')}</label>
          <input
            type="tel"
            id="phoneNumber"
            name="phoneNumber"
            value={shippingInfo.phoneNumber}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div>
          <label htmlFor="shippingMethod" className="block mb-1 font-medium">{t('shipping.shippingMethod')}</label>
          <select
            id="shippingMethod"
            name="shippingMethod"
            value={shippingInfo.shippingMethod}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="dpd_standard">{t('shipping.dpdStandard')}</option>
            <option value="dhl_standard">{t('shipping.dhlStandard')}</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300 mt-6"
        >
          {t('shipping.proceedToPayment')}
        </button>
      </form>
    </div>
  );
};

const Payment = ({ savePaymentInfo, createOrder, fetchUserInfo, cart, trackEvent, clearCart }) => {
  const { t } = useTranslation();
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
  const [error, setError] = useState(null);

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
    setLoading(true);
    setError(null);
    try {
      await savePaymentInfo(paymentInfo);
      const orderDetails = {
        items: cart,
        total: cart.reduce((total, item) => total + item.price, 0),
        status: t('orderStatus.pending')
      };
      const orderId = await createOrder(orderDetails);
      trackEvent('purchase', 'Ecommerce', 'Purchase Complete', orderDetails.total);
      clearCart();
      navigate('/order-confirmation', { state: { orderId } });
    } catch (error) {
      console.error('Error processing payment:', error);
      setError(t('paymentPage.errorProcessing'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t('paymentPage.loading')}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{t('paymentPage.title')}</h1>

      <button onClick={() => navigate('/shipping')} className="flex items-center text-blue-500 hover:text-blue-700 mb-6">
        <ArrowLeft className="mr-2" size={20} />
        {t('paymentPage.backToShipping')}
      </button>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="cardholderName" className="block mb-1 font-medium">{t('paymentPage.cardholderName')}</label>
          <input
            type="text"
            id="cardholderName"
            name="cardholderName"
            value={paymentInfo.cardholderName}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div>
          <label htmlFor="cardNumber" className="block mb-1 font-medium">{t('paymentPage.cardNumber')}</label>
          <input
            type="text"
            id="cardNumber"
            name="cardNumber"
            value={paymentInfo.cardNumber}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
            placeholder={t('paymentPage.cardNumberPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="expiryDate" className="block mb-1 font-medium">{t('paymentPage.expiryDate')}</label>
            <input
              type="text"
              id="expiryDate"
              name="expiryDate"
              value={paymentInfo.expiryDate}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
              placeholder={t('paymentPage.expiryDatePlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="cvv" className="block mb-1 font-medium">{t('paymentPage.cvv')}</label>
            <input
              type="text"
              id="cvv"
              name="cvv"
              value={paymentInfo.cvv}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
              placeholder={t('paymentPage.cvvPlaceholder')}
            />
          </div>
        </div>
        <h2 className="text-2xl font-bold mt-6 mb-4">{t('paymentPage.billingAddress')}</h2>
        <div>
          <label htmlFor="billing.street" className="block mb-1 font-medium">{t('paymentPage.street')}</label>
          <input
            type="text"
            id="billing.street"
            name="billing.street"
            value={paymentInfo.billingAddress.street}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="billing.city" className="block mb-1 font-medium">{t('paymentPage.city')}</label>
            <input
              type="text"
              id="billing.city"
              name="billing.city"
              value={paymentInfo.billingAddress.city}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="billing.country" className="block mb-1 font-medium">{t('paymentPage.country')}</label>
            <input
              type="text"
              id="billing.country"
              name="billing.country"
              value={paymentInfo.billingAddress.country}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="billing.postalCode" className="block mb-1 font-medium">{t('paymentPage.postalCode')}</label>
          <input
            type="text"
            id="billing.postalCode"
            name="billing.postalCode"
            value={paymentInfo.billingAddress.postalCode}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div className="mt-6">
          <h2 className="text-2xl font-bold mb-4">{t('paymentPage.orderSummary')}</h2>
          <div className="border-t border-b py-4">
            {cart.map((item, index) => (
              <div key={index} className="flex justify-between items-center mb-2">
                <span>{item.name}</span>
                <span>{t('product.price', { symbol: t('currency.symbol'), amount: item.price.toFixed(2) })}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center font-bold text-lg mt-4">
            <span>{t('paymentPage.total')}:</span>
            <span>{t('product.price', { symbol: t('currency.symbol'), amount: cart.reduce((total, item) => total + item.price, 0).toFixed(2) })}</span>
          </div>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300 mt-6"
          disabled={loading}
        >
          {loading ? t('paymentPage.loading') : t('paymentPage.completePurchase')}
        </button>
      </form>
    </div>
  );
};

const OrderHistory = ({ fetchUserOrders }) => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const userOrders = await fetchUserOrders();
        setOrders(userOrders);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [fetchUserOrders]);

  if (loading) {
    return <div className="text-center py-8">{t('orderHistory.loading')}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{t('orderHistory.title')}</h1>
      {orders.length === 0 ? (
        <p className="text-center text-gray-500">{t('orderHistory.noOrders')}</p>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="bg-white shadow-md rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {t('orderHistory.orderId')}: {order.id}
                </h2>
                <span className="text-sm text-gray-500">
                  {t('orderHistory.date')}: {new Date(order.createdAt.seconds * 1000).toLocaleDateString()}
                </span>
              </div>
              <p>
                <strong>{t('orderHistory.status')}:</strong> {order.status}
              </p>
              <p>
                <strong>{t('orderHistory.total')}:</strong> {t('product.price', { symbol: t('currency.symbol'), amount: order.total.toFixed(2) })}
              </p>
              <h3 className="font-bold mt-4 mb-2">{t('orderHistory.items')}:</h3>
              <ul className="list-disc list-inside">
                {order.items.map((item, index) => (
                  <li key={index}>
                    {item.name} - {t('product.price', { symbol: t('currency.symbol'), amount: item.price.toFixed(2) })}
                  </li>
                ))}
              </ul>
              <Link
                to={`/order-confirmation`}
                state={{ orderId: order.id }}
                className="mt-4 inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
              >
                {t('orderHistory.viewDetails')}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const OrderConfirmation = () => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const orderId = location.state?.orderId;
  const { t } = useTranslation();

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        setLoading(false);
        return;
      }

      try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
          setOrder({ id: orderDoc.id, ...orderDoc.data() });
        }
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return <div className="text-center py-8">{t('orderConfirmation.loading')}</div>;
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-4">{t('orderConfirmation.orderNotFound')}</h1>
        <p>{t('orderConfirmation.orderNotFoundMessage')}</p>
        <Link to="/" className="text-blue-500 hover:underline mt-4 inline-block">{t('orderConfirmation.returnHome')}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">{t('orderConfirmation.title')}</h1>
        <p className="text-xl text-gray-600">{t('orderConfirmation.thankYou')}</p>
      </div>

      <div className="bg-gray-100 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t('orderConfirmation.orderDetails')}</h2>
        <p><strong>{t('orderConfirmation.orderId')}:</strong> {order.id}</p>
        <p><strong>{t('orderConfirmation.date')}:</strong> {new Date(order.createdAt.seconds * 1000).toLocaleString()}</p>
        <p><strong>{t('orderConfirmation.status')}:</strong> {order.status}</p>
        <p><strong>{t('orderConfirmation.total')}:</strong> {t('product.price', { symbol: t('currency.symbol'), amount: order.total.toFixed(2) })}</p>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t('orderConfirmation.orderSummary')}</h2>
        {order.items.map((item, index) => (
          <div key={index} className="flex justify-between items-center border-b py-2">
            <span>{item.name}</span>
            <span>{t('product.price', { symbol: t('currency.symbol'), amount: item.price.toFixed(2) })}</span>
          </div>
        ))}
        <div className="flex justify-between items-center font-bold mt-4">
          <span>{t('orderConfirmation.total')}</span>
          <span>{t('product.price', { symbol: t('currency.symbol'), amount: order.total.toFixed(2) })}</span>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t('orderConfirmation.whatsNext')}</h2>
        <div className="flex items-center mb-4">
          <Package className="w-6 h-6 mr-2 text-blue-500" />
          <span>{t('orderConfirmation.preparingOrder')}</span>
        </div>
        <div className="flex items-center">
          <Truck className="w-6 h-6 mr-2 text-blue-500" />
          <span>{t('orderConfirmation.shippingConfirmation')}</span>
        </div>
      </div>

      <div className="text-center">
        <Link to="/" className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition duration-300">
          {t('orderConfirmation.continueShopping')}
        </Link>
      </div>
    </div>
  );
};

export default App;