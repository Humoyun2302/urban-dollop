import image_0925b238d9d319ce3b3ed01f17e960b369cb7a8a from 'figma:asset/0925b238d9d319ce3b3ed01f17e960b369cb7a8a.png';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Search as SearchIcon, Heart, Search } from 'lucide-react';
import { Button } from './ui/button';
import { BookingCard } from './BookingCard';
import { SearchFilters } from './SearchFilters';
import { BookingModal } from './BookingModal';
import { BookingOptionsModal } from './BookingOptionsModal';
import { GuestInfoModal } from './GuestInfoModal';
import { CustomerProfileEditor } from './CustomerProfileEditor';
import { BarberCard } from './BarberCard';
import { Booking, Barber, User } from '../types';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../utils/supabase/client';
import heroImage from 'figma:asset/5eceab60a15800f1d2517e332e1efe6944a4bf02.png';

// Safe string helpers to prevent crashes on undefined/null values
const safeStr = (v: any): string => (v == null ? '' : String(v));
const safeSplit = (v: any, sep: string): string[] => safeStr(v).split(sep);

interface CustomerDashboardProps {
  customer: User | null;
  bookings: Booking[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCancelBooking: (id: string) => void;
  onRescheduleBooking: (bookingId: string, newBooking: Omit<Booking, 'id'>) => void;
  onBookAgain: (booking: Booking) => void;
  onAddBooking: (booking: Omit<Booking, 'id'>) => void;
  onUpdateProfile: (updatedCustomer: User) => void;
  barbers: Barber[];
  isBarbersLoading?: boolean;
  favoriteIds?: string[];
  onToggleFavorite?: (barberId: string) => void;
  onNavigateToLogin?: () => void;
}

export function CustomerDashboard({
  customer,
  bookings,
  activeTab,
  onTabChange,
  onCancelBooking,
  onRescheduleBooking,
  onBookAgain,
  onAddBooking,
  onUpdateProfile,
  barbers,
  isBarbersLoading = false,
  favoriteIds,
  onToggleFavorite,
  onNavigateToLogin,
}: CustomerDashboardProps) {
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [bookingMode, setBookingMode] = useState<'new' | 'reschedule'>('new');
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null);
  const [existingBookingData, setExistingBookingData] = useState<Booking | undefined>();
  
  // Guest booking states
  const [showBookingOptions, setShowBookingOptions] = useState(false);
  const [showGuestInfo, setShowGuestInfo] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ name: string; phone: string } | null>(null);

  const { t } = useLanguage();

  // Handle shared barber link - Auto-open booking modal
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedBarberId = urlParams.get('barber');
    
    if (sharedBarberId && barbers.length > 0 && activeTab === 'search') {
      console.log('🔗 Shared barber link detected, looking for barber:', sharedBarberId);
      
      // Find the shared barber
      const sharedBarber = barbers.find(b => b.id === sharedBarberId);
      
      if (sharedBarber) {
        console.log('✅ Found shared barber, auto-opening profile:', sharedBarber.name);
        
        // Small delay for smooth animation
        setTimeout(() => {
          setSelectedBarber(sharedBarber);
          setBookingMode('new');
          setExistingBookingData(undefined);
          setShowBookingModal(true);
          
          // Clean up URL after opening
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
          
          // Show toast
          toast.success(t('toast.openingBarberProfile') || `Opening ${sharedBarber.name}'s profile`, {
            duration: 2000,
          });
        }, 500);
      } else {
        console.log('❌ Shared barber not found in current barbers list');
      }
    }
  }, [barbers, activeTab, t]);

  const handleBookNow = (barber: Barber) => {
    // If user is logged in, proceed to booking modal directly
    if (customer) {
      setSelectedBarber(barber);
      setBookingMode('new');
      setExistingBookingData(undefined);
      setShowBookingModal(true);
    } else {
      // If user is not logged in, show booking options modal
      setSelectedBarber(barber);
      setShowBookingOptions(true);
    }
  };

  // Handle guest booking selection
  const handleGuestBookingSelected = () => {
    setShowBookingOptions(false);
    setShowGuestInfo(true);
  };

  // Handle sign in selection
  const handleSignInSelected = () => {
    setShowBookingOptions(false);
    if (onNavigateToLogin) {
      onNavigateToLogin();
    } else {
      onTabChange('profile');
      toast.info(t('booking.pleaseSignIn') || "Please sign in to continue");
    }
  };

  // Handle guest info submission
  const handleGuestInfoSubmit = (info: { name: string; phone: string }) => {
    setGuestInfo(info);
    setShowGuestInfo(false);
    
    // Open booking modal with guest info
    setBookingMode('new');
    setExistingBookingData(undefined);
    setShowBookingModal(true);
    
    toast.success(t('booking.guestInfoReceived', { name: info.name }));
  };

  const handleReschedule = (booking: Booking) => {
    const barber = barbers.find(b => b.id === booking.barberId);
    if (barber) {
      setSelectedBarber(barber);
      setBookingMode('reschedule');
      setRescheduleBookingId(booking.id);
      setExistingBookingData(booking);
      setShowBookingModal(true);
      // Auto-redirect to search tab to show the booking modal
      if (activeTab !== 'search') {
        onTabChange('search');
        // Show a quick toast to inform user
        toast.info(t('toast.openingReschedulePage'), {
          duration: 2000,
        });
      }
    }
  };

  const handleBookAgainClick = (booking: Booking) => {
    const barber = barbers.find(b => b.id === booking.barberId);
    if (barber) {
      setSelectedBarber(barber);
      setBookingMode('new');
      // Pre-fill with the same booking data for "Book Again"
      setExistingBookingData(booking);
      setShowBookingModal(true);
      // Auto-redirect to search tab to show the booking modal
      if (activeTab !== 'search') {
        onTabChange('search');
        // Show a quick toast to inform user
        toast.info(t('toast.openingBookingPage'), {
          duration: 2000,
        });
      }
    }
  };

  const handleConfirmBooking = (booking: Omit<Booking, 'id'>) => {
    if (bookingMode === 'reschedule' && rescheduleBookingId) {
      onRescheduleBooking(rescheduleBookingId, booking);
    } else {
      onAddBooking(booking);
    }
    setShowBookingModal(false);
    setRescheduleBookingId(null);
  };

  if (activeTab === 'profile') {
    return (
      <AnimatePresence>
        <CustomerProfileEditor
          customer={customer}
          onClose={() => onTabChange('search')}
          onSave={onUpdateProfile}
        />
      </AnimatePresence>
    );
  }

  if (activeTab === 'favorites') {
    console.log('[FAVORITES PAGE] 🔍 Rendering favorites:', {
      favoriteIdsCount: favoriteIds?.length || 0,
      favoriteIds: favoriteIds,
      barbersCount: barbers.length,
      customerId: customer?.id
    });
    
    const favoriteBarbers = barbers.filter(barber => 
      favoriteIds?.includes(barber.id)
    );
    
    console.log('[FAVORITES PAGE] ✅ Filtered favorite barbers:', favoriteBarbers.length);

    return (
      <>
        <div className="flex-1 w-full bg-[#FCFDFF] py-8 px-4">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h1 className="mb-2">{t('customer.favorites.title')}</h1>
              <p className="text-gray-600 dark:text-gray-400">
                {t('customer.favorites.subtitle')}
              </p>
            </motion.div>

            {favoriteBarbers.length > 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {favoriteBarbers.map((barber, index) => (
                  <motion.div
                    key={barber.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <BarberCard
                      barber={barber}
                      onBookNow={handleBookNow}
                      isFavorite={true}
                      onToggleFavorite={onToggleFavorite}
                    />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16 px-4"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="inline-block mb-4"
                >
                  <Heart className="w-16 h-16 text-gray-300" />
                </motion.div>
                <h3 className="mb-2 text-gray-700">{t('customer.favorites.noFavorites')}</h3>
                <p className="text-gray-600 mb-6">
                  {t('customer.favorites.noFavoritesMessage')}
                </p>
                <Button onClick={() => onTabChange('search')} size="lg" className="gap-2 w-full sm:w-auto text-sm sm:text-base px-6 py-3 sm:px-8 text-[12px]">
                  <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden min-[400px]:inline">{t('customer.favorites.browseBarbers')}</span>
                </Button>
              </motion.div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showBookingModal && selectedBarber && (
            <BookingModal
              barber={selectedBarber}
              onClose={() => {
                setShowBookingModal(false);
                setRescheduleBookingId(null);
                setGuestInfo(null);
              }}
              onConfirmBooking={handleConfirmBooking}
              onBookingSuccess={() => {
                // Booking was successfully created in database
              }}
              customerId={customer?.id || guestInfo?.phone || ''}
              customerName={customer?.name || guestInfo?.name || ''}
              mode={bookingMode}
              existingBooking={existingBookingData}
              onNavigateToLogin={onNavigateToLogin}
              guestInfo={guestInfo}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  if (activeTab === 'search' || !customer) {
    return (
      <>
        <div className="flex-1 w-full bg-[#FCFDFF] py-8 px-4">
          <div className="max-w-7xl mx-auto">
            {/* Hero Section */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12 text-center"
            >
              {/* Heading */}
              <h1 className="mb-6 text-[rgb(44,44,44)] sm:text-[24px] md:text-[28px] lg:text-[32px] font-[Dela_Gothic_One] text-[32px] font-bold">
                Bardak
              </h1>
              
              {/* Hero Illustration */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="flex justify-center mb-8"
              >
                <img 
                  src={image_0925b238d9d319ce3b3ed01f17e960b369cb7a8a} 
                  alt="Booking illustration" 
                  className="w-full max-w-[350px] sm:max-w-[500px] md:max-w-[650px] lg:max-w-[800px] h-auto sm:px-6 md:px-0 p-[0px]"
                />
              </motion.div>
            </motion.div>

            <SearchFilters 
              barbers={barbers} 
              isBarbersLoading={isBarbersLoading}
              onBookNow={handleBookNow}
              favoriteIds={favoriteIds || []}
              onToggleFavorite={onToggleFavorite}
            />
          </div>
        </div>
        
        <AnimatePresence>
          {showBookingModal && selectedBarber && (
            <BookingModal
              barber={selectedBarber}
              onClose={() => {
                setShowBookingModal(false);
                setRescheduleBookingId(null);
                setGuestInfo(null);
              }}
              onConfirmBooking={handleConfirmBooking}
              onBookingSuccess={() => {
                // Booking was successfully created in database
              }}
              customerId={customer?.id || guestInfo?.phone || ''}
              customerName={customer?.name || guestInfo?.name || ''}
              mode={bookingMode}
              existingBooking={existingBookingData}
              onNavigateToLogin={onNavigateToLogin}
              guestInfo={guestInfo}
            />
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {showBookingOptions && selectedBarber && (
            <BookingOptionsModal
              isOpen={showBookingOptions}
              onClose={() => setShowBookingOptions(false)}
              onGuestBooking={handleGuestBookingSelected}
              onSignIn={handleSignInSelected}
            />
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {showGuestInfo && selectedBarber && (
            <GuestInfoModal
              isOpen={showGuestInfo}
              onClose={() => setShowGuestInfo(false)}
              onSubmit={handleGuestInfoSubmit}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="flex-1 w-full bg-[#FCFDFF] py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="mb-2">{customer ? t('customer.dashboard.welcomeBackName', { name: customer.name }) : t('app.name')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('customer.dashboard.hereBookingOverview')}</p>
        </motion.div>

        <div className="mb-6">
          {/* Filter out cancelled bookings and past bookings */}
          {(() => {
            const now = new Date();
            const activeBookings = bookings.filter(b => {
              // Filter out cancelled bookings
              if (b.status === 'cancelled') return false;
              
              // Skip bookings with missing required fields
              if (!b.date || !b.startTime) return false;
              
              // Filter out past bookings
              const bookingDate = new Date(b.date);
              const [hours, minutes] = safeSplit(b.startTime, ':').map(Number);
              bookingDate.setHours(hours, minutes, 0, 0);
              
              return bookingDate > now;
            });
            
            return (
              <AnimatePresence mode="popLayout">
                {activeBookings.length > 0 ? (
                  <motion.div
                    key="bookings-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {activeBookings.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        viewAs="customer"
                        onCancel={onCancelBooking}
                        onReschedule={() => handleReschedule(booking)}
                        onBookAgain={() => handleBookAgainClick(booking)}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="no-bookings"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="text-center py-16 px-4"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      className="inline-block mb-4"
                    >
                      <Scissors className="w-16 h-16 text-gray-300" />
                    </motion.div>
                    <h3 className="mb-2 text-gray-700">{t('customer.dashboard.noUpcomingBookings')}</h3>
                    <p className="text-gray-600 mb-6">
                      {t('customer.dashboard.noBookingsMessage')}
                    </p>
                    <Button onClick={() => onTabChange('search')} size="lg" className="gap-2">
                      <SearchIcon className="w-5 h-5" />
                      {t('customer.findBarber')}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })()}
        </div>
      </div>
    </div>
  );
}