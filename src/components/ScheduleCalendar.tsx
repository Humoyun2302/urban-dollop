import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Plus, Trash2, Edit, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { toast } from 'sonner@2.0.3';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { supabase } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info.tsx';

interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
  booked?: boolean;
}

interface DaySchedule {
  day: string;
  date: string;
  isOff: boolean;
  slots: TimeSlot[];
}

const DAYS_PER_PAGE = 8;

const SkeletonItem = ({ className }: { className?: string }) => (
  <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
      initial={{ x: '-100%' }}
      animate={{ x: '100%' }}
      transition={{ 
        repeat: Infinity, 
        duration: 1.5, 
        ease: "linear",
        repeatDelay: 0.5 
      }}
    />
  </div>
);

interface ScheduleCalendarProps {
  barberId?: string;
  refreshTrigger?: number;
}

export function ScheduleCalendar({ barberId: propBarberId, refreshTrigger }: ScheduleCalendarProps = {}) {
  const { t } = useLanguage();
  
  // Get barberId from prop or derive from KV auth session
  const [barberId, setBarberId] = useState<string | null>(propBarberId || null);
  
  // If barberId not passed as prop, get from KV session (verify-session endpoint)
  useEffect(() => {
    if (propBarberId) {
      console.log('[SLOTS] Using barberId from prop:', propBarberId);
      setBarberId(propBarberId);
      return;
    }
    
    const getBarberId = async () => {
      const sessionToken = localStorage.getItem('trimly_session_token');
      if (!sessionToken) {
        console.error('[SLOTS] No session token found');
        return;
      }
      
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-166b98fa/auth/verify-session`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({ sessionToken }),
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.valid && data.userId && data.role === 'barber') {
            console.log('[SLOTS] Got barberId from session:', data.userId);
            setBarberId(data.userId);
          }
        }
      } catch (e) {
        console.error('[SLOTS] Failed to get barberId from session:', e);
      }
    };
    
    getBarberId();
  }, [propBarberId]);

  const getTranslatedDayName = (dayIndex: number, pageIdx: number): string => {
    // Calculate the actual date for this day
    const windowStart = getPageStartDate(pageIdx);
    const targetDate = new Date(windowStart);
    targetDate.setDate(windowStart.getDate() + dayIndex);
    
    // Get the actual day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    const jsDay = targetDate.getDay();
    
    // Convert to our day keys (0=Monday, 1=Tuesday, ..., 6=Sunday)
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return t(`schedule.${dayKeys[jsDay]}`);
  };

  const getDateStringForPage = (dayIndex: number, pageIdx: number): string => {
    const windowStart = getPageStartDate(pageIdx);
    const targetDate = new Date(windowStart);
    targetDate.setDate(windowStart.getDate() + dayIndex);
    const monthNames = t('months.short') as any;
    const monthIndex = targetDate.getMonth();
    const day = targetDate.getDate();
    return `${monthNames[monthIndex]} ${day}`;
  };

  // Helper to get the actual date for a day index in YYYY-MM-DD format
  const getActualDate = (dayIndex: number, pageIdx: number): string => {
    const windowStart = getPageStartDate(pageIdx);
    const targetDate = new Date(windowStart);
    targetDate.setDate(windowStart.getDate() + dayIndex);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to normalize time to HH:MM:SS format
  const normalizeTime = (time: string): string => {
    const parts = time.split(':');
    const hours = parts[0].padStart(2, '0');
    const minutes = (parts[1] || '00').padStart(2, '0');
    const seconds = (parts[2] || '00').padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const [weekSchedule, setWeekSchedule] = useState<DaySchedule[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ dayIndex: number; slotId: string } | null>(null);
  const [editingTime, setEditingTime] = useState('09:00');
  
  const [recommendedStep] = useState(30);

  // Time picker modal state for first slot
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [timePickerDayIndex, setTimePickerDayIndex] = useState<number | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState('');

  // Page pagination state (0 = first 8 days, 1 = next 8 days, etc.)
  const [pageIndex, setPageIndex] = useState(0);
  const MAX_PAGES = 3; // Limit to 3 pages (24 days total)

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Load barber availability from database
  useEffect(() => {
    const loadAvailability = async () => {
      if (!barberId) return;
      
      try {
        const { data, error } = await supabase
          .from('barbers')
          .select('is_available')
          .eq('id', barberId)
          .single();
        
        if (error) {
          console.error('[AVAILABILITY] Error loading availability:', error);
          return;
        }
        
        // Set unavailable to the opposite of is_available (for backward compatibility with the switch logic)
        setUnavailable(data?.is_available === false);
        console.log('[AVAILABILITY] Loaded from database:', { is_available: data?.is_available, unavailable: data?.is_available === false });
      } catch (err) {
        console.error('[AVAILABILITY] Exception loading availability:', err);
      }
    };
    
    loadAvailability();
  }, [barberId]);

  // Handle availability toggle
  const handleAvailabilityToggle = async (checked: boolean) => {
    if (!barberId) {
      toast.error('Unable to update availability');
      return;
    }

    const newAvailability = !checked; // Switch is "unavailable", so flip it for is_available
    
    console.log('[AVAILABILITY] Toggle clicked:', { 
      checked, 
      newAvailability, 
      barberId,
      meaning: checked ? 'Marking as UNAVAILABLE (hidden)' : 'Marking as AVAILABLE (visible)'
    });
    
    try {
      const { error } = await supabase
        .from('barbers')
        .update({ is_available: newAvailability })
        .eq('id', barberId);

      if (error) {
        console.error('[AVAILABILITY] Error updating availability:', error);
        toast.error(t('toast.availabilityUpdateFailed') || 'Failed to update availability');
        return;
      }

      setUnavailable(checked);
      
      console.log('[AVAILABILITY] ✅ Successfully updated database:', {
        barberId,
        is_available: newAvailability,
        unavailable: checked,
        message: checked ? 'Barber is now HIDDEN from customers' : 'Barber is now VISIBLE to customers'
      });
      
      toast.success(
        checked 
          ? (t('schedule.nowUnavailable') || 'You are now hidden from customers')
          : (t('schedule.nowAvailable') || 'You are now visible to customers')
      );
      
      console.log('[AVAILABILITY] Updated successfully:', { is_available: newAvailability, unavailable: checked });
    } catch (err) {
      console.error('[AVAILABILITY] Exception updating availability:', err);
      toast.error(t('toast.availabilityUpdateFailed') || 'Failed to update availability');
    }
  };

  // Helper to get page start date based on pageIndex (FROM TODAY, not Monday)
  const getPageStartDate = (pageIdx: number): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() + (pageIdx * DAYS_PER_PAGE));
    return windowStart;
  };

  // Load slots from Supabase public.barber_slots table
  const loadSlots = async (isBackgroundRefresh = false) => {
    if (!barberId) {
      console.log('[SLOTS] barberId is null, skipping load');
      if (!isBackgroundRefresh) setIsLoading(false);
      return;
    }

    if (!isBackgroundRefresh) {
      setIsLoading(true);
    }

    console.log('[SLOTS] Loading slots for barberId:', barberId);

    try {
      // Get current page's date range
      const windowStart = getPageStartDate(pageIndex);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowStart.getDate() + (DAYS_PER_PAGE - 1));

      const startStr = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, '0')}-${String(windowStart.getDate()).padStart(2, '0')}`;
      const endStr = `${windowEnd.getFullYear()}-${String(windowEnd.getMonth() + 1).padStart(2, '0')}-${String(windowEnd.getDate()).padStart(2, '0')}`;

      console.log('[SLOTS] Fetching slots for page:', { startStr, endStr, barberId });

      // Get KV session token from localStorage
      const sessionToken = localStorage.getItem('trimly_session_token');
      if (!sessionToken) {
        console.error('[SLOTS] No active session found');
        toast.error('Please login to view schedule');
        if (!isBackgroundRefresh) setIsLoading(false);
        return;
      }

      // CRITICAL: Fetch ALL slots (including booked) from backend API
      // Backend uses service role to bypass RLS, ensuring booked slots are included
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-166b98fa/barber/slots?start_date=${startStr}&end_date=${endStr}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'x-session-token': sessionToken,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[SLOTS] API error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch slots');
      }

      const result = await response.json();
      const data = result.slots || [];

      console.log('[SLOTS] Fetched rows count:', data?.length || 0);
      console.log('[SLOTS] Fetched slots:', data);

      // Initialize empty schedule for DAYS_PER_PAGE days
      const newSchedule: DaySchedule[] = Array.from({ length: DAYS_PER_PAGE }, (_, idx) => ({
        day: '',
        date: getActualDate(idx, pageIndex),
        isOff: true,
        slots: []
      }));

      if (data && data.length > 0) {
        console.log('[SLOTS] ✅ Fetched', data.length, 'slots from database');
        console.log('[SLOTS] All fetched slots:', data);
        
        data.forEach((slot: any) => {
          // Convert slot_date to day index (0 to DAYS_PER_PAGE-1 for the window)
          const slotDate = new Date(slot.slot_date + 'T00:00:00');
          const daysDiff = Math.floor((slotDate.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff >= 0 && daysDiff < DAYS_PER_PAGE) {
            const dayIndex = daysDiff;
            const formattedTime = slot.start_time.slice(0, 5); // HH:MM
            
            // SINGLE SOURCE OF TRUTH: Use is_booked column (boolean TRUE/FALSE)
            const isBooked = slot.is_booked === true;
            
            console.log('[SLOT PROCESSING]', {
              id: slot.id,
              time: formattedTime,
              date: slot.slot_date,
              is_booked: slot.is_booked,
              isBooked: isBooked,
              will_show: isBooked ? '🔴 RED (Booked)' : '🟢 GREEN (Available)',
              all_fields: slot
            });
            
            newSchedule[dayIndex].slots.push({
              id: slot.id,
              time: formattedTime,
              available: !isBooked, // Available if not booked
              booked: isBooked
            });
            newSchedule[dayIndex].isOff = false;
          }
        });

        // Sort slots for each day
        newSchedule.forEach(day => {
          day.slots.sort((a, b) => {
            const timeA = a.time.split(':').map(Number);
            const timeB = b.time.split(':').map(Number);
            return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
          });
        });
        
        console.log('[SLOTS] ✅ Final schedule with ALL slots:', newSchedule.map((day, idx) => ({
          day: idx,
          date: day.date,
          slotCount: day.slots.length,
          slots: day.slots.map(s => ({ time: s.time, booked: s.booked }))
        })));
      }
      
      setWeekSchedule(newSchedule);
      console.log('[SLOTS] Schedule loaded successfully');
    } catch (e) {
      console.error('[SLOTS] Error fetching schedule:', e);
      toast.error("Failed to load schedule");
    } finally {
      if (!isBackgroundRefresh) {
        // Add a small delay for smoother transition
        setTimeout(() => {
          setIsLoading(false);
        }, 300);
      }
    }
  };

  // Listen for refreshTrigger changes to reload slots
  useEffect(() => {
    if (refreshTrigger !== undefined && barberId) {
      console.log('[SLOTS] Refresh trigger received, reloading slots...');
      loadSlots(true);
    }
  }, [refreshTrigger, barberId]);

  // Realtime subscription for slots updates (bookings, status changes)
  useEffect(() => {
    if (!barberId) return;

    console.log('[SLOTS] 🔴 Setting up realtime subscription for barber_slots...');
    const channel = supabase
      .channel(`barber-slots-updates-${barberId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'barber_slots',
          filter: `barber_id=eq.${barberId}`
        },
        (payload) => {
          console.log('[SLOTS] 🔴 Realtime UPDATE received:', payload);
          // Reload slots immediately when a slot is updated (e.g. booked)
          loadSlots(true);
        }
      )
      .subscribe((status) => {
        console.log('[SLOTS] 🔴 Subscription status:', status);
      });

    return () => {
      console.log('[SLOTS] 🔴 Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [barberId]);

  // Load slots when barberId becomes available or pageIndex changes
  useEffect(() => {
    if (barberId) {
      console.log('[SLOTS] barberId available or pageIndex changed, loading slots');
      // Initial load with skeleton
      loadSlots(false);
      
      // Set up polling to refresh slots every 5 seconds to catch bookings/cancellations
      const pollInterval = setInterval(() => {
        console.log('[SLOTS] Polling for slot updates...');
        loadSlots(true); // Background refresh
      }, 5000);
      
      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [barberId, pageIndex]);

  const toggleDayOff = async (dayIndex: number) => {
    const currentDay = weekSchedule[dayIndex];
    const newIsOff = !currentDay.isOff;

    if (newIsOff) {
       // If turning OFF, delete all slots for this day
       try {
         const slotDate = getActualDate(dayIndex, pageIndex);
         
         const { error } = await supabase
           .from('barber_slots')
           .delete()
           .eq('barber_id', barberId)
           .eq('slot_date', slotDate);

         if (error) throw error;
         
         // Update local state
         setWeekSchedule(prev => prev.map((day, idx) => 
           idx === dayIndex ? { ...day, isOff: true, slots: [] } : day
         ));

         const dayName = getTranslatedDayName(dayIndex, pageIndex);
         toast.success(t('schedule.markedAsOff').replace('{day}', dayName));
       } catch (e) {
         console.error("Error clearing day schedule", e);
         toast.error("Failed to update schedule");
       }
    } else {
       // If turning ON, just update local state (no slots yet)
       setWeekSchedule(prev => prev.map((day, idx) => 
         idx === dayIndex ? { ...day, isOff: false } : day
       ));
       const dayName = getTranslatedDayName(dayIndex, pageIndex);
       toast.success(t('schedule.markedAsWorking').replace('{day}', dayName));
    }
  };

  const isDuplicateTime = (dayIndex: number, time: string, excludeSlotId?: string): boolean => {
    return weekSchedule[dayIndex]?.slots.some(
      (slot) => slot.time === time && slot.id !== excludeSlotId
    ) || false;
  };

  const openAddSlotDialog = async (dayIndex: number) => {
    // Get the actual date for this day
    const slotDate = getActualDate(dayIndex, pageIndex);
    
    // Check if the day has existing slots
    const existingSlotsForDay = weekSchedule[dayIndex]?.slots || [];
    
    if (existingSlotsForDay.length === 0) {
      // NO SLOTS: Show time picker modal
      console.log('[ADD SLOT] No existing slots for this day, showing time picker modal');
      
      // Set default time to current time (HH:MM format)
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      setSelectedStartTime(currentTime);
      setTimePickerDayIndex(dayIndex);
      setShowTimePickerModal(true);
      return;
    }
    
    // HAS SLOTS: Auto-add next slot at (latest + 30 minutes)
    try {
      // Query database directly for the latest existing slot for this barber and date
      const { data: latestSlots, error } = await supabase
        .from('barber_slots')
        .select('start_time')
        .eq('barber_id', barberId)
        .eq('slot_date', slotDate)
        .order('start_time', { ascending: false })
        .limit(1);

      if (error) {
        console.error('❌ Error fetching latest slot:', error);
        toast.error('Failed to load slots');
        return;
      }

      if (latestSlots && latestSlots.length > 0) {
        // Found the latest slot, add 30 minutes to it
        const lastSlot = latestSlots[0];
        const [hours, minutes] = lastSlot.start_time.split(':').map(Number);
        
        // Add 30 minutes to the last slot time
        const totalMinutes = hours * 60 + minutes + 30;
        const newHours = Math.floor(totalMinutes / 60);
        const newMinutes = totalMinutes % 60;
        
        // Format as HH:MM
        const nextTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
        
        console.log('[ADD SLOT] Latest slot found:', lastSlot.start_time, '→ Next time:', nextTime);
        
        // Check for duplicate before adding
        if (isDuplicateTime(dayIndex, nextTime)) {
          toast.error('This time slot already exists');
          return;
        }
        
        // Instantly create the slot
        await instantAddTimeSlot(dayIndex, nextTime);
      }
    } catch (e) {
      console.error('❌ Error in openAddSlotDialog:', e);
      toast.error('Failed to add slot');
    }
  };

  const instantAddTimeSlot = async (dayIndex: number, slotTime: string) => {
    // Local utility to calculate end time (start + 60 minutes for slot duration)
    const calculateEndTime = (startTime: string): string => {
      const [h, m] = startTime.split(':').map(Number);
      const totalMinutes = h * 60 + m + 60; // 60 min duration
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMinutes = totalMinutes % 60;
      return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
    };

    // Frontend validation: Prevent adding slots in the past
    const slotDate = getActualDate(dayIndex, pageIndex);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selectedDate = new Date(slotDate + 'T00:00:00');
    
    console.log('[ADD SLOT] Starting add slot process:', {
      dayIndex,
      slotTime,
      slotDate,
      barberId
    });
    
    // Check if slot date is in the past
    if (selectedDate < today) {
      console.log('[ADD SLOT] ❌ Date is in the past');
      toast.error('Cannot add slots in the past');
      return;
    }
    
    // If slot date is today, check if time has passed
    if (selectedDate.getTime() === today.getTime()) {
      const [slotHour, slotMin] = slotTime.split(':').map(Number);
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const slotMinutes = slotHour * 60 + slotMin;
      const currentMinutes = currentHour * 60 + currentMin;
      
      if (slotMinutes <= currentMinutes) {
        console.log('[ADD SLOT] ❌ Time has already passed');
        toast.error('Cannot add slots for times that have already passed');
        return;
      }
    }

    try {
      // Get KV session token from localStorage
      const sessionToken = localStorage.getItem('trimly_session_token');
      if (!sessionToken) {
        console.error('❌ No active session found');
        toast.error('Please login to add slots');
        return;
      }

      console.log('[ADD SLOT] Session token found:', sessionToken.substring(0, 20) + '...');

      // Calculate times
      const startTime = normalizeTime(slotTime);
      const endTime = normalizeTime(calculateEndTime(slotTime));

      const payload = {
        slot_date: slotDate,
        start_time: startTime,
        end_time: endTime,
        is_available: true
      };

      console.log('[ADD SLOT] Sending request to backend:', payload);

      // Call backend API with KV session token
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-166b98fa/barber/slots`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': sessionToken,
          },
          body: JSON.stringify(payload),
        }
      );

      console.log('[ADD SLOT] Response status:', response.status);

      if (!response.ok) {
        const result = await response.json();
        console.error('❌ Failed to add slot:', result);
        
        // Show user-friendly error messages
        if (response.status === 401) {
          toast.error('Session expired. Please login again.');
        } else if (response.status === 403) {
          toast.error('Only barbers can create slots');
        } else if (result.error) {
          toast.error(`Failed to add slot: ${result.error}`);
        } else {
          toast.error('Failed to add slot. Please try again.');
        }
        return;
      }

      console.log('✅ Slot added successfully');
      toast.success(t('schedule.slotAddedSuccess'));

      // Re-fetch slots from Supabase to update UI
      await loadSlots();
    } catch (e: any) {
      console.error('❌ Error adding slot:', e?.message || e);
    }
  };

  const removeTimeSlot = async (dayIndex: number, slotId: string) => {
    try {
      // Get KV session token from localStorage
      const sessionToken = localStorage.getItem('trimly_session_token');
      if (!sessionToken) {
        console.error('❌ No active session found');
        toast.error('Please login to delete slots');
        return;
      }

      console.log('[DELETE SLOT] Attempting to delete slot:', { slotId });

      // Call backend API to delete slot (uses service role, bypasses RLS)
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-166b98fa/barber/slots/${slotId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': sessionToken,
          },
        }
      );

      const result = await response.json();

      console.log('[DELETE SLOT] Backend response:', { result, status: response.status });

      if (!response.ok) {
        console.error('❌ DELETE SLOT ERROR:', result);
        throw new Error(result.error || result.details || 'Failed to delete slot');
      }

      console.log('✅ Slot deleted successfully from database');

      // Update local state immediately (optimistic UI)
      setWeekSchedule(prev => prev.map((day, idx) =>
          idx === dayIndex
            ? { ...day, slots: day.slots.filter((slot) => slot.id !== slotId) }
            : day
      ));
      
      toast.success(t('toast.timeSlotRemoved'));

      // Re-fetch slots from Supabase to ensure UI stays in sync
      console.log('[DELETE SLOT] Re-fetching slots from database after delete');
      await loadSlots();
    } catch (e: any) {
      console.error('❌ Error removing slot:', e);
      console.error('❌ Error details:', {
        message: e?.message,
        stack: e?.stack
      });
      toast.error('Failed to delete slot');
    }
  };

  const startEditingSlot = (dayIndex: number, slotId: string, time: string) => {
    setEditingSlot({ dayIndex, slotId });
    setEditingTime(time);
  };

  const cancelEditingSlot = () => {
    setEditingSlot(null);
    setEditingTime('09:00');
  };

  const saveTimeSlot = async () => {
    if (!editingSlot) return;
    if (isDuplicateTime(editingSlot.dayIndex, editingTime, editingSlot.slotId)) {
      toast.error(t('toast.duplicateTimeError'));
      return;
    }

    try {
      // Calculate end time (start + 60 minutes)
      const [h, m] = editingTime.split(':').map(Number);
      const totalMinutes = h * 60 + m + 60;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMinutes = totalMinutes % 60;
      const endTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
      
      const { error } = await supabase
        .from('barber_slots')
        .update({
          start_time: editingTime,
          end_time: endTime
        })
        .eq('id', editingSlot.slotId);

      if (error) throw error;

      setWeekSchedule(prev => prev.map((day, idx) =>
          idx === editingSlot.dayIndex
            ? {
                ...day,
                slots: day.slots.map((slot) =>
                  slot.id === editingSlot.slotId
                    ? { ...slot, time: editingTime }
                    : slot
                ).sort((a, b) => a.time.localeCompare(b.time)),
              }
            : day
      ));
      toast.success(t('toast.timeSlotUpdated'));
      cancelEditingSlot();
    } catch (e) {
      console.error("Error updating slot", e);
      toast.error("Failed to update time slot");
    }
  };

  // Handle time picker modal confirmation
  const handleTimePickerConfirm = async () => {
    if (!selectedStartTime || timePickerDayIndex === null) {
      toast.error('Please select a time');
      return;
    }

    // Check for duplicate
    if (isDuplicateTime(timePickerDayIndex, selectedStartTime)) {
      toast.error('This time slot already exists');
      return;
    }

    // Close modal
    setShowTimePickerModal(false);

    // Create the slot
    await instantAddTimeSlot(timePickerDayIndex, selectedStartTime);

    // Reset state
    setTimePickerDayIndex(null);
    setSelectedStartTime('');
  };

  const handleTimePickerCancel = () => {
    setShowTimePickerModal(false);
    setTimePickerDayIndex(null);
    setSelectedStartTime('');
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-md bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"></div>
            <div className="flex items-center gap-3">
              <Label htmlFor="unavailable" className="text-sm">
                {t('schedule.markAsUnavailable')}
              </Label>
              <Switch
                id="unavailable"
                checked={unavailable}
                onCheckedChange={handleAvailabilityToggle}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {unavailable && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200"
            >
              <p className="text-sm text-amber-800">{t('schedule.unavailableWarning')}</p>
            </motion.div>
          )}

          {/* Page Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
              disabled={pageIndex === 0}
              className="gap-2 rounded-[12px]"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('common.back')}
            </Button>
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex(prev => prev + 1)}
              disabled={pageIndex >= MAX_PAGES - 1}
              className="gap-2 rounded-[12px]"
            >
              {t('common.next')}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4 bg-[rgba(0,31,233,0)]">
            <AnimatePresence mode="wait">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="p-4 rounded-lg border border-gray-100 bg-white"
                  >
                    <div className="mb-3 space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <SkeletonItem className="h-4 w-24 rounded" />
                        <SkeletonItem className="h-3 w-12 rounded" />
                      </div>
                      <SkeletonItem className="h-7 w-full rounded-md" />
                    </div>
                    <div className="space-y-2 mt-4">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <SkeletonItem key={j} className="h-10 w-full rounded-lg" />
                      ))}
                    </div>
                  </motion.div>
                ))
              ) : (
                weekSchedule.map((daySchedule, dayIndex) => (
                  <motion.div
                    key={`${pageIndex}-${dayIndex}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: dayIndex * 0.05 }}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      daySchedule.isOff
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-primary/5 border-primary/20'
                    }`}
                  >
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-900 leading-relaxed pb-0.5">{getTranslatedDayName(dayIndex, pageIndex)}</h4>
                        <span className="text-xs text-gray-500">{getDateStringForPage(dayIndex, pageIndex)}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleDayOff(dayIndex)}
                        className="w-full text-xs h-7 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
                      >
                        {daySchedule.isOff ? t('schedule.setAsWorking') : t('schedule.setAsOff')}
                      </Button>
                    </div>

                    {!daySchedule.isOff && (
                      <div className="space-y-2 bg-[rgba(0,0,0,0)]">
                        {daySchedule.slots.map((slot) => {
                          const isEditing = editingSlot?.dayIndex === dayIndex && editingSlot?.slotId === slot.id;
                          const isBooked = slot.booked || false;
                          
                          return (
                            <motion.div
                              key={slot.id}
                              whileHover={{ scale: isBooked ? 1 : 1.02 }}
                              className={`p-3 rounded-xl text-xs shadow-sm transition-all border-2 ${
                                isBooked
                                  ? 'bg-red-50 border-red-200 cursor-not-allowed'
                                  : 'bg-white border-primary/20 hover:border-primary/30 hover:shadow-md'
                              }`}
                            >
                              {isEditing && !isBooked ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="time"
                                      value={editingTime}
                                      onChange={(e) => setEditingTime(e.target.value)}
                                      className="h-7 text-xs flex-1"
                                      step={recommendedStep * 60}
                                    />
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={saveTimeSlot}
                                      className="h-6 flex-1 gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      {t('schedule.save')}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={cancelEditingSlot}
                                      className="h-6 flex-1 gap-1"
                                    >
                                      <X className="w-3 h-3" />
                                      {t('schedule.cancel')}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                      <Clock className={`w-3 h-3 ${isBooked ? 'text-red-600' : ''}`} />
                                      <span className={isBooked ? 'text-red-800 font-medium' : ''}>{slot.time}</span>
                                    </div>
                                    {!isBooked && (
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => startEditingSlot(dayIndex, slot.id, slot.time)}
                                          className="h-5 w-5 p-0"
                                        >
                                          <Edit className="w-3 h-3 text-blue-500" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeTimeSlot(dayIndex, slot.id)}
                                          className="h-5 w-5 p-0"
                                        >
                                          <Trash2 className="w-3 h-3 text-red-500" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs w-full justify-center font-semibold rounded-lg ${
                                      isBooked
                                        ? 'bg-red-100 text-red-700 border-red-300'
                                        : 'bg-primary/10 text-primary border-primary/30'
                                    }`}
                                  >
                                    {isBooked ? t('schedule.booked') : t('schedule.open')}
                                  </Badge>
                                </>
                              )}
                            </motion.div>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAddSlotDialog(dayIndex)}
                          className="w-full gap-1 text-xs h-7"
                        >
                          <Plus className="w-3 h-3" />
                          {t('schedule.addSlot')}
                        </Button>
                      </div>
                    )}
                    {daySchedule.isOff && (
                      <div className="flex items-center justify-center py-4">
                        <span className="text-xs text-gray-500">{t('schedule.dayOff')}</span>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Time Picker Modal */}
      <Dialog open={showTimePickerModal} onOpenChange={setShowTimePickerModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('schedule.addSlot') || 'Add Time Slot'}</DialogTitle>
            <DialogDescription>
              {t('schedule.addSlotDescription') || 'Choose a start time to create the first time slot'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">{t('schedule.startTime') || 'Start Time'}</Label>
              <Input
                type="time"
                id="startTime"
                value={selectedStartTime}
                onChange={(e) => setSelectedStartTime(e.target.value)}
                step={recommendedStep * 60}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTimePickerCancel}
            >
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleTimePickerConfirm}
            >
              {t('common.confirm') || 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}