import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, DollarSign, ChevronDown, X, RefreshCw, Repeat, Phone, Copy, User } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Booking } from '../types';
import { toast } from 'sonner@2.0.3';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../utils/supabase/client';

// Safe string helpers to prevent crashes on undefined/null values
const safeStr = (v: any): string => (v == null ? '' : String(v));
const safeSplit = (v: any, sep: string): string[] => safeStr(v).split(sep);

interface BookingCardProps {
  booking: Booking;
  viewAs: 'customer' | 'barber';
  onCancel?: (id: string) => void;
  onReschedule?: () => void;
  onBookAgain?: () => void;
}

export function BookingCard({ booking, viewAs, onCancel, onReschedule, onBookAgain }: BookingCardProps) {
  const [barberPhone, setBarberPhone] = useState<string | null>(null);
  const { t } = useLanguage();

  // Fetch barber phone from Supabase for customer view
  useEffect(() => {
    const fetchBarberPhone = async () => {
      if (viewAs === 'customer' && booking.barberId) {
        try {
          const { data, error } = await supabase
            .from('barbers')
            .select('phone')
            .eq('id', booking.barberId)
            .single();
          
          if (!error && data?.phone) {
            setBarberPhone(data.phone);
          }
        } catch (err) {
          console.error('Error fetching barber phone:', err);
        }
      }
    };

    fetchBarberPhone();
  }, [booking.barberId, viewAs]);

  const statusColors = {
    confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    pending: 'bg-amber-100 text-amber-700 border-amber-300',
    cancelled: 'bg-red-100 text-red-700 border-red-300',
    rescheduled: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    
    const weekdayMap: Record<number, string> = {
      0: t('weekdays.short.sun'),
      1: t('weekdays.short.mon'),
      2: t('weekdays.short.tue'),
      3: t('weekdays.short.wed'),
      4: t('weekdays.short.thu'),
      5: t('weekdays.short.fri'),
      6: t('weekdays.short.sat'),
    };

    const weekday = weekdayMap[date.getDay()];
    const day = date.getDate();
    
    return `${weekday} ${day}`;
  };

  const formatDateTime = (dateTimeString: string) => {
    const date = new Date(dateTimeString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel(booking.id);
      toast.success(t('toast.bookingCancelled'));
    }
  };

  const handleReschedule = () => {
    if (onReschedule) {
      onReschedule();
    }
  };

  const handleBookAgain = () => {
    if (onBookAgain) {
      onBookAgain();
    }
  };

  // Use joined barber/customer objects if available, fallback to deprecated fields
  const displayName = viewAs === 'customer' 
    ? (booking.barber?.full_name || booking.barberName || 'Barber')
    : (booking.customer?.full_name || booking.customerName || (booking as any).manualCustomerName || 'Customer');
  const displayAvatar = viewAs === 'customer' 
    ? (booking.barber?.avatar || booking.barberAvatar)
    : booking.customerAvatar;

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      toast.success(t('bookingCard.phoneCopied'), {
        description: phone,
      });
    }).catch(() => {
      toast.error(t('bookingCard.phoneCopyFailed'));
    });
  };

  const handleCallPhone = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 h-full rounded-[20px]">
        <CardContent className="p-4 sm:p-6 rounded-[100px]">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-start justify-center gap-3 mb-[12px]">
                <div className="text-center">
                  <h3 className="truncate">{viewAs === 'customer' ? (booking.barber?.full_name || booking.barberName || 'Barber') : ((booking as any).source === 'manual' || (booking as any).source === 'guest' ? ((booking as any).manualCustomerName || 'Walk-in Customer') : (booking.customer?.full_name || booking.customerName || 'Customer'))}</h3>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <p className="text-gray-600 dark:text-gray-400">{booking.serviceType}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-5 text-gray-600 dark:text-gray-400 w-full text-center">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm">
                    {(() => {
                      const date = new Date(booking.date);
                      const months = t('common.months.short') as unknown as string[];
                      const monthName = (Array.isArray(months) && months[date.getMonth()]) || date.toLocaleString('en-US', { month: 'short' });
                      const month = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                      const day = date.getDate().toString().padStart(2, '0');
                      return `${month} ${day}`;
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm">
                    {safeSplit(booking.startTime, ':').slice(0, 2).join(':')} - {safeSplit(booking.endTime, ':').slice(0, 2).join(':')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <DollarSign className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm">{formatPrice(booking.price)} UZS</span>
                </div>
              </div>

              {/* Status Information - Show for cancelled or rescheduled */}
              {viewAs === 'barber' && (booking.status === 'cancelled' || booking.status === 'rescheduled') && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-4 p-3 rounded-lg border-l-4 ${
                    booking.status === 'cancelled'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-400'
                      : 'bg-orange-50 dark:bg-orange-900/20 border-orange-400'
                  }`}
                >
                  <div className="space-y-1.5">
                    {booking.status === 'cancelled' && booking.cancelledAt && (
                      <div className="text-sm">
                        <span className="font-medium text-red-700 dark:text-red-400">{t('bookingCard.cancelled')}</span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {t('bookingCard.updated')} {formatDateTime(booking.cancelledAt)}
                        </p>
                      </div>
                    )}
                    {booking.status === 'rescheduled' && booking.previousDate && booking.previousTime && (
                      <div className="text-sm">
                        <span className="font-medium text-orange-700 dark:text-orange-400">{t('bookingCard.rescheduled')}</span>
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                          <p>{t('bookingCard.previous')} {formatDate(booking.previousDate)} {t('bookingCard.at')} {booking.previousTime}</p>
                          <p>{t('bookingCard.new')} {formatDate(booking.date)} {t('bookingCard.at')} {booking.startTime}</p>
                          {booking.updatedAt && (
                            <p className="mt-1 text-gray-500">{t('bookingCard.updated')} {formatDateTime(booking.updatedAt)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {viewAs === 'customer' && booking.status !== 'cancelled' && (
                <div className="flex flex-col sm:flex-row gap-2 w-full mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                    className="gap-1.5 w-full sm:w-auto sm:flex-1 h-9 md:h-9 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 hover:text-red-600 transition-all duration-300 text-[13px] md:text-xs rounded-[20px] whitespace-nowrap border-gray-200"
                  >
                    <X className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 flex-shrink-0" />
                    <span className="truncate">{t('bookingCard.cancel')}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReschedule}
                    className="gap-1.5 w-full sm:w-auto sm:flex-1 h-9 md:h-9 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-300 hover:text-blue-600 transition-all duration-300 text-[13px] md:text-xs rounded-lg whitespace-nowrap border-gray-200"
                  >
                    <RefreshCw className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 flex-shrink-0" />
                    <span className="truncate">{t('bookingCard.reschedule')}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBookAgain}
                    className="gap-1.5 w-full sm:w-auto sm:flex-1 h-9 md:h-9 hover:bg-emerald-50 dark:hover:bg-emerald-950 hover:border-emerald-300 hover:text-emerald-600 transition-all duration-300 text-[13px] md:text-xs rounded-lg whitespace-nowrap border-gray-200"
                  >
                    <Repeat className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 flex-shrink-0" />
                    <span className="truncate">{t('bookingCard.bookAgain')}</span>
                  </Button>
                </div>
              )}

              {/* Phone Number Section - Always visible */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{t('bookingCard.phoneNumberLabel')}</span>
                  {viewAs === 'customer' && barberPhone ? (
                    <div className="flex items-center gap-1.5 bg-[rgba(0,0,0,0)]">
                      <Phone className="w-4 h-4 text-[#4A8EFF] flex-shrink-0" />
                      <a
                        href={`tel:${barberPhone}`}
                        className="font-medium text-[rgb(74,142,255)] dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-30 transition-colors whitespace-nowrap"
                      >
                        {barberPhone}
                      </a>
                    </div>
                  ) : viewAs === 'barber' && (booking.customerPhone || booking.customer?.phone || (booking as any).manualCustomerPhone) ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                      <a
                        href={`tel:${booking.customerPhone || booking.customer?.phone || (booking as any).manualCustomerPhone}`}
                        className="font-medium text-primary dark:text-primary/90 hover:text-primary/80 dark:hover:text-primary/70 transition-colors whitespace-nowrap"
                      >
                        {booking.customerPhone || booking.customer?.phone || (booking as any).manualCustomerPhone}
                      </a>
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-500">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}