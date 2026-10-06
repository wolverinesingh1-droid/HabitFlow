import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import Svg, { Circle } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MOODS = [
  { emoji: '😄', label: 'Great' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '😔', label: 'Low' },
  { emoji: '😫', label: 'Rough' },
  { emoji: '😴', label: 'Tired' },
  { emoji: '🤒', label: 'Sick' },
  { emoji: '😤', label: 'Frustrated' },
  { emoji: '🔥', label: 'Motivated' },
];

const GOAL_OPTIONS = [
  { days: 30, label: '30 days', sub: '1 month challenge' },
  { days: 60, label: '60 days', sub: '2 month challenge' },
  { days: 90, label: '90 days', sub: '3 month challenge' },
  { days: 100, label: '100 days', sub: 'The 100-day challenge' },
];

const AVATARS = [
  { id: 'fox', emoji: '🦊', color: '#F5A623' },
  { id: 'panda', emoji: '🐼', color: '#E8E8E8' },
  { id: 'frog', emoji: '🐸', color: '#7DD3C0' },
  { id: 'lion', emoji: '🦁', color: '#F5C542' },
  { id: 'octopus', emoji: '🐙', color: '#E74C8C' },
  { id: 'blossom', emoji: '🌸', color: '#FFB6C1' },
  { id: 'bolt', emoji: '⚡', color: '#F5E642' },
  { id: 'fire', emoji: '🔥', color: '#FF6B35' },
];

const MILESTONE_THEMES = [
  { accent: '#7DD3C0', name: 'Teal' },
  { accent: '#B084D6', name: 'Violet' },
  { accent: '#F5C542', name: 'Gold' },
  { accent: '#FF6B6B', name: 'Coral' },
  { accent: '#4ECDC4', name: 'Aqua' },
  { accent: '#F5A623', name: 'Amber' },
];

const getMilestoneTheme = (milestone: number) =>
  MILESTONE_THEMES[(milestone - 1) % MILESTONE_THEMES.length];

const STORAGE_KEY = 'gracedays_days_v1';
const MILESTONE_SIZE = 10;
const GRACE_PER_MILESTONE = 2;

type DayStatus = 'completed' | 'missed' | 'grace' | 'today' | 'future';

type DayData = {
  day: number;
  status: DayStatus;
  mood?: string;
  note?: string;
  reflection?: string;
  date?: string;
};

type AppState = {
  days: DayData[];
  startDate: string;
  dayOffset: number;
  celebratedMilestones: number[];
  totalDays: number;
  habitName: string;
  userName: string;
  avatarId: string;
  needsSetup: boolean;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const daysBetween = (startISO: string, endISO: string) => {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
};

const buildDays = (startDate: string, offset: number, totalDays: number): DayData[] => {
  const todayIndex = daysBetween(startDate, todayISO()) + offset + 1;
  return Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    if (day < todayIndex) return { day, status: 'missed' as DayStatus };
    if (day === todayIndex) return { day, status: 'today' as DayStatus };
    return { day, status: 'future' as DayStatus };
  });
};

const createInitialState = (): AppState => ({
  days: [],
  startDate: todayISO(),
  dayOffset: 0,
  celebratedMilestones: [],
  totalDays: 30,
  habitName: '',
  userName: '',
  avatarId: 'fox',
  needsSetup: true,
});

const createStartedState = (
  totalDays: number,
  habitName: string,
  userName: string,
  avatarId: string
): AppState => {
  const startDate = todayISO();
  return {
    days: buildDays(startDate, 0, totalDays),
    startDate,
    dayOffset: 0,
    celebratedMilestones: [],
    totalDays,
    habitName,
    userName,
    avatarId,
    needsSetup: false,
  };
};

const recomputeStatuses = (s: AppState): DayData[] => {
  const todayIndex = daysBetween(s.startDate, todayISO()) + s.dayOffset + 1;
  return s.days.map((d) => {
    if (d.status === 'completed' || d.status === 'grace') return d;
    if (d.day < todayIndex) return { ...d, status: 'missed' };
    if (d.day === todayIndex) return { ...d, status: 'today' };
    return { ...d, status: 'future' };
  });
};

const RING_SIZE = 170;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function HomeScreen() {
  const [activeMilestone, setActiveMilestone] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [state, setState] = useState<AppState>(createInitialState);
  const [loaded, setLoaded] = useState(false);
  const [celebration, setCelebration] = useState<number | null>(null);
  const [setupStep, setSetupStep] = useState(1);
  const [inputName, setInputName] = useState('');
  const [inputHabit, setInputHabit] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('fox');
  const [pendingMood, setPendingMood] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [noteViewerDay, setNoteViewerDay] = useState<DayData | null>(null);
  const [reflectionDay, setReflectionDay] = useState<number | null>(null);
  const [reflectionText, setReflectionText] = useState('');
  const [confettiKey, setConfettiKey] = useState(0);
  const cardRef = useRef<View>(null);

  // Animated values
  const ringProgress = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0.3)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(20)).current;
  const crownDrop = useRef(new Animated.Value(-80)).current;
  const crownPulse = useRef(new Animated.Value(1)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle2Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: AppState = JSON.parse(saved);
          const hydrated: AppState = {
            ...parsed,
            celebratedMilestones: parsed.celebratedMilestones || [],
            totalDays: parsed.totalDays || 30,
            habitName: parsed.habitName || 'Morning Meditation',
            userName: parsed.userName || '',
            avatarId: parsed.avatarId || 'fox',
            needsSetup: parsed.needsSetup ?? false,
          };
          setState({ ...hydrated, days: recomputeStatuses(hydrated) });
        }
      } catch (e) {
        console.log('Load failed:', e);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.log('Save failed:', e)
    );
  }, [state, loaded]);

  // Confetti fires ONCE per celebration open (no loop)
  useEffect(() => {
    if (celebration === null) return;
    setConfettiKey(1);
  }, [celebration]);

  useEffect(() => {
    if (celebration === null) {
      ringProgress.setValue(0);
      glowPulse.setValue(0);
      avatarScale.setValue(0.3);
      cardFade.setValue(0);
      cardSlide.setValue(20);
      crownDrop.setValue(-80);
      crownPulse.setValue(1);
      sparkle1.setValue(0);
      sparkle2.setValue(0);
      sparkle2Y.setValue(0);
      return;
    }

    ringProgress.setValue(0);
    glowPulse.setValue(0);
    avatarScale.setValue(0.3);
    cardFade.setValue(0);
    cardSlide.setValue(20);
    crownDrop.setValue(-80);
    crownPulse.setValue(1);
    sparkle1.setValue(0);
    sparkle2.setValue(0);
    sparkle2Y.setValue(0);

    Animated.sequence([
      Animated.spring(avatarScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(ringProgress, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.spring(crownDrop, {
          toValue: 0,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle1, {
          toValue: 1,
          duration: 500,
          delay: 600,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle2, {
          toValue: 1,
          duration: 500,
          delay: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(cardSlide, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(crownPulse, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(crownPulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle2Y, {
          toValue: -6,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle2Y, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [celebration]);

  useEffect(() => {
    if (!loaded || state.needsSetup) return;
    const totalMilestones = Math.ceil(state.totalDays / MILESTONE_SIZE);
    for (let m = 1; m <= totalMilestones; m++) {
      if (state.celebratedMilestones.includes(m)) continue;
      const milestoneDays = state.days.filter(
        (d) => d.day >= (m - 1) * MILESTONE_SIZE + 1 && d.day <= m * MILESTONE_SIZE
      );
      if (milestoneDays.length === 0) continue;
      const allDone = milestoneDays.every(
        (d) => d.status === 'completed' || d.status === 'grace'
      );
      if (allDone) {
        setCelebration(m);
        setState((prev) => ({
          ...prev,
          celebratedMilestones: [...prev.celebratedMilestones, m],
        }));
        break;
      }
    }
  }, [state.days, loaded, state.needsSetup]);

  const handleStart = (totalDays: number) => {
    setState(
      createStartedState(
        totalDays,
        inputHabit.trim() || 'Morning Meditation',
        inputName.trim() || 'Friend',
        selectedAvatar
      )
    );
    setActiveMilestone(1);
  };

  const days = state.days;
  const totalDays = state.totalDays;
  const totalMilestones = Math.ceil(totalDays / MILESTONE_SIZE);
  const completedCount = days.filter((d) => d.status === 'completed').length;
  const graceUsedCount = days.filter((d) => d.status === 'grace').length;
  const missedCount = days.filter((d) => d.status === 'missed').length;
  const progressPercent = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;
  const activeAvatar = AVATARS.find((a) => a.id === state.avatarId) || AVATARS[0];

  const totalRoughDays = graceUsedCount + missedCount;
  const resilienceScore = totalRoughDays === 0
    ? 100
    : Math.round((graceUsedCount / totalRoughDays) * 100);

  const latestCompleted = [...days].reverse().find((d) => d.status === 'completed' && d.mood);
  const latestMood = latestCompleted?.mood;

  const getDaysForMilestone = (milestone: number) => {
    const start = (milestone - 1) * MILESTONE_SIZE + 1;
    const end = Math.min(milestone * MILESTONE_SIZE, totalDays);
    return days.filter((d) => d.day >= start && d.day <= end);
  };

  const visibleDays = getDaysForMilestone(activeMilestone);

  const openPicker = () => {
    setPendingMood(null);
    setDraftNote('');
    setPickerOpen(true);
  };

  const handleMoodSelect = (emoji: string) => {
    setPendingMood(emoji);
  };

  const handleConfirmCheckIn = () => {
    if (!pendingMood) return;
    const finalMood = pendingMood;
    const finalNote = draftNote.trim();

    setState((prev) => ({
      ...prev,
      days: prev.days.map((d) =>
        d.status === 'today'
          ? {
              ...d,
              status: 'completed',
              mood: finalMood,
              note: finalNote || undefined,
              date: todayISO(),
            }
          : d
      ),
    }));
    setPickerOpen(false);
    setPendingMood(null);
    setDraftNote('');
  };

  const handleDayPress = (d: DayData) => {
    if (d.status === 'today') {
      openPicker();
      return;
    }
    if (d.status === 'completed' || d.status === 'grace') {
      if (d.note || d.mood || d.reflection) setNoteViewerDay(d);
      return;
    }
    if (d.status === 'missed') {
      const milestone = Math.ceil(d.day / MILESTONE_SIZE);
      const graceUsed = state.days.filter(
        (x) => x.status === 'grace' && Math.ceil(x.day / MILESTONE_SIZE) === milestone
      ).length;
      if (graceUsed < GRACE_PER_MILESTONE) {
        setReflectionDay(d.day);
        setReflectionText('');
      }
    }
  };

  const handleApplyGrace = () => {
    if (reflectionDay === null) return;
    const dayToGrace = reflectionDay;
    const reflection = reflectionText.trim();
    setState((prev) => ({
      ...prev,
      days: prev.days.map((x) =>
        x.day === dayToGrace
          ? { ...x, status: 'grace', reflection: reflection || undefined }
          : x
      ),
    }));
    setReflectionDay(null);
    setReflectionText('');
  };

  const handleReset = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setState(createInitialState());
    setActiveMilestone(1);
    setSetupStep(1);
    setInputName('');
    setInputHabit('');
    setSelectedAvatar('fox');
  };

  const handleAdvanceDay = () => {
    setState((prev) => {
      const next: AppState = { ...prev, dayOffset: prev.dayOffset + 1 };
      return { ...next, days: recomputeStatuses(next) };
    });
  };

  const handleShare = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      console.log('Share failed:', e);
    }
  };

  const handleContinue = () => {
    setCelebration(null);
    for (let m = 1; m <= totalMilestones; m++) {
      const milestoneDays = state.days.filter(
        (d) => d.day >= (m - 1) * MILESTONE_SIZE + 1 && d.day <= m * MILESTONE_SIZE
      );
      const hasUnfinished = milestoneDays.some(
        (d) => d.status !== 'completed' && d.status !== 'grace'
      );
      if (hasUnfinished) {
        setActiveMilestone(m);
        return;
      }
    }
  };

  const getCellStyle = (status: DayStatus) => {
    switch (status) {
      case 'completed': return styles.cellCompleted;
      case 'missed': return styles.cellMissed;
      case 'grace': return styles.cellGrace;
      case 'today': return styles.cellToday;
      case 'future': return styles.cellFuture;
    }
  };

  if (!loaded) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#7DD3C0" />
      </View>
    );
  }

  if (state.needsSetup) {
    return (
      <View style={styles.setupContainer}>
        <ScrollView contentContainerStyle={styles.setupScroll}>
          <Text style={styles.setupBrand}>GraceDays</Text>

          {setupStep === 1 && (
            <>
              <Text style={styles.setupTitle}>What should we call you?</Text>
              <Text style={styles.setupSubtitle}>This shows on your share card</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#5F6F68"
                value={inputName}
                onChangeText={setInputName}
                maxLength={20}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => inputName.trim() && setSetupStep(2)}
              />
              <TouchableOpacity
                style={[styles.nextButton, !inputName.trim() && styles.nextButtonDisabled]}
                onPress={() => inputName.trim() && setSetupStep(2)}
                disabled={!inputName.trim()}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {setupStep === 2 && (
            <>
              <Text style={styles.setupTitle}>What habit are you building?</Text>
              <Text style={styles.setupSubtitle}>Keep it short and specific</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Morning Meditation"
                placeholderTextColor="#5F6F68"
                value={inputHabit}
                onChangeText={setInputHabit}
                maxLength={30}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => inputHabit.trim() && setSetupStep(3)}
              />
              <TouchableOpacity
                style={[styles.nextButton, !inputHabit.trim() && styles.nextButtonDisabled]}
                onPress={() => inputHabit.trim() && setSetupStep(3)}
                disabled={!inputHabit.trim()}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {setupStep === 3 && (
            <>
              <Text style={styles.setupTitle}>Pick your companion</Text>
              <Text style={styles.setupSubtitle}>This stays with you through the journey</Text>
              <View style={styles.avatarGrid}>
                {AVATARS.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.avatarOption,
                      { backgroundColor: a.color + '22', borderColor: a.color },
                      selectedAvatar === a.id && { backgroundColor: a.color + '44' },
                    ]}
                    onPress={() => setSelectedAvatar(a.id)}
                  >
                    <Text style={styles.avatarEmoji}>{a.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => setSetupStep(4)}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {setupStep === 4 && (
            <>
              <Text style={styles.setupTitle}>Choose your challenge</Text>
              <Text style={styles.setupSubtitle}>How long do you want to build this habit?</Text>
              <View style={styles.setupOptions}>
                {GOAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.days}
                    style={styles.setupOption}
                    onPress={() => handleStart(opt.days)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.setupOptionLabel}>{opt.label}</Text>
                    <Text style={styles.setupOptionSub}>{opt.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={styles.stepDots}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={[styles.stepDot, setupStep >= s && styles.stepDotActive]}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  const celebrationDays = celebration
    ? state.days.filter(
        (d) =>
          d.day >= (celebration - 1) * MILESTONE_SIZE + 1 &&
          d.day <= celebration * MILESTONE_SIZE
      )
    : [];

  const finalDay = celebrationDays[celebrationDays.length - 1];
  const finalNote = finalDay?.note;

  const celebrationCompleted = celebrationDays.filter((d) => d.status === 'completed').length;
  const celebrationGrace = celebrationDays.filter((d) => d.status === 'grace').length;
  const celebrationMoods = celebrationDays.filter((d) => d.status === 'completed' && d.mood);
  const milestoneTheme = celebration ? getMilestoneTheme(celebration) : MILESTONE_THEMES[0];
  const isFinalMilestone = celebration === totalMilestones;

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.28],
  });

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  const ringStrokeDashoffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.miniAvatar, { backgroundColor: activeAvatar.color + '33', borderColor: activeAvatar.color }]}>
              <Text style={styles.miniAvatarEmoji}>{activeAvatar.emoji}</Text>
              {latestMood && (
                <View style={[styles.miniAvatarBadge, { backgroundColor: milestoneTheme.accent }]}>
                  <Text style={styles.miniAvatarBadgeText}>{latestMood}</Text>
                </View>
              )}
            </View>
            <View>
              <Text style={styles.appName}>{state.userName}</Text>
              <Text style={styles.date}>Today</Text>
            </View>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconButton} onPress={handleAdvanceDay}>
              <Text style={styles.iconText}>⏭️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleReset}>
              <Text style={styles.iconText}>🔄</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.habitName}>{state.habitName}</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeText}>🔥 Active</Text>
            </View>
          </View>
          <View style={styles.streakRow}>
            <Text style={styles.streakNumber}>{completedCount}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{completedCount} / {totalDays} days completed</Text>
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>

          <View style={styles.resilienceRow}>
            <View style={styles.resiliencePill}>
              <Text style={styles.resilienceLabel}>Resilience</Text>
              <Text style={styles.resilienceValue}>{resilienceScore}%</Text>
            </View>
            <Text style={styles.resilienceHint}>
              {graceUsedCount > 0
                ? `You kept going through ${graceUsedCount} rough ${graceUsedCount === 1 ? 'day' : 'days'}`
                : 'Keep showing up — even with grace days'}
            </Text>
          </View>
        </View>

        <Text style={styles.milestoneLabel}>Milestone</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.milestoneScroll}
        >
          {Array.from({ length: totalMilestones }, (_, i) => i + 1).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.milestoneTab, activeMilestone === m && styles.milestoneTabActive]}
              onPress={() => setActiveMilestone(m)}
            >
              <Text style={[styles.milestoneText, activeMilestone === m && styles.milestoneTextActive]}>
                M{m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>
          Milestone {activeMilestone} · Days {(activeMilestone - 1) * MILESTONE_SIZE + 1}–
          {Math.min(activeMilestone * MILESTONE_SIZE, totalDays)}
        </Text>

        <View style={styles.grid}>
          {visibleDays.map((d) => {
            const isToday = d.status === 'today';
            const isMissed = d.status === 'missed';
            const isCompleted = d.status === 'completed';
            const isGrace = d.status === 'grace';
            const hasNote = !!d.note || !!d.reflection;

            return (
              <TouchableOpacity
                key={d.day}
                style={[styles.dayCell, getCellStyle(d.status)]}
                onPress={() => handleDayPress(d)}
                activeOpacity={0.6}
              >
                {isCompleted && d.mood && <Text style={styles.dayEmoji}>{d.mood}</Text>}
                {isMissed && <Text style={styles.missedX}>✕</Text>}
                {isGrace && <Text style={styles.dayEmoji}>🛡️</Text>}
                {isToday && <Text style={styles.todayPlus}>＋</Text>}
                {hasNote && <View style={styles.noteDot} />}
                <Text style={styles.dayLabel}>D{d.day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#7DD3C0' }]} /><Text style={styles.legendText}>Completed</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#E74C3C' }]} /><Text style={styles.legendText}>Missed (tap to grace)</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#B084D6' }]} /><Text style={styles.legendText}>Grace</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#F5C542' }]} /><Text style={styles.legendText}>Today</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#FFFFFF', width: 6, height: 6, borderRadius: 3 }]} /><Text style={styles.legendText}>Note</Text></View>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>How was today?</Text>
              <Text style={styles.modalSubtitle}>Tap a mood to check in</Text>
              <View style={styles.moodGrid}>
                {MOODS.map((m) => (
                  <TouchableOpacity
                    key={m.label}
                    style={[
                      styles.moodButton,
                      pendingMood === m.emoji && styles.moodButtonSelected,
                    ]}
                    onPress={() => handleMoodSelect(m.emoji)}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={styles.moodLabel}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.noteInput}
                placeholder="Add a note (optional)"
                placeholderTextColor="#5F6F68"
                value={draftNote}
                onChangeText={setDraftNote}
                maxLength={80}
                multiline
              />

              <TouchableOpacity
                style={[styles.confirmButton, !pendingMood && styles.nextButtonDisabled]}
                onPress={handleConfirmCheckIn}
                disabled={!pendingMood}
              >
                <Text style={styles.confirmButtonText}>
                  {pendingMood ? 'Confirm Check-in' : 'Pick a mood first'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={reflectionDay !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReflectionDay(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setReflectionDay(null)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Rough day, huh?</Text>
              <Text style={styles.modalSubtitle}>
                No pressure. A note helps you spot patterns later.
              </Text>

              <TextInput
                style={styles.noteInput}
                placeholder="What made today hard? (optional)"
                placeholderTextColor="#5F6F68"
                value={reflectionText}
                onChangeText={setReflectionText}
                maxLength={120}
                multiline
              />

              <TouchableOpacity style={styles.confirmButton} onPress={handleApplyGrace}>
                <Text style={styles.confirmButtonText}>Use Grace Day</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setReflectionDay(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={noteViewerDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteViewerDay(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNoteViewerDay(null)}>
          <Pressable style={styles.noteViewerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.noteViewerDay}>Day {noteViewerDay?.day}</Text>
            <Text style={styles.noteViewerMood}>{noteViewerDay?.mood || '🛡️'}</Text>
            {noteViewerDay?.reflection && (
              <Text style={styles.noteViewerReflection}>"{noteViewerDay.reflection}"</Text>
            )}
            {noteViewerDay?.note ? (
              <Text style={styles.noteViewerText}>"{noteViewerDay.note}"</Text>
            ) : !noteViewerDay?.reflection ? (
              <Text style={styles.noteViewerEmpty}>No note for this day</Text>
            ) : null}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setNoteViewerDay(null)}
            >
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={celebration !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCelebration(null)}
      >
        <View style={styles.celebrationBackdrop}>
          {celebration !== null && confettiKey > 0 && (
            <ConfettiCannon
              key={`left-${confettiKey}`}
              count={140}
              origin={{ x: -10, y: -20 }}
              fadeOut={false}
              autoStart
              fallSpeed={1400}
              explosionSpeed={150}
              colors={[milestoneTheme.accent, activeAvatar.color, '#7DD3C0', '#F5C542', '#FF6B6B', '#FFFFFF']}
            />
          )}
          {celebration !== null && confettiKey > 0 && (
            <ConfettiCannon
              key={`right-${confettiKey}`}
              count={140}
              origin={{ x: 400, y: -20 }}
              fadeOut={false}
              autoStart
              fallSpeed={1400}
              explosionSpeed={150}
              colors={[milestoneTheme.accent, activeAvatar.color, '#7DD3C0', '#F5C542', '#FF6B6B', '#FFFFFF']}
            />
          )}
          <ScrollView contentContainerStyle={styles.celebrationScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.celebrationContent}>

              <View style={styles.ringWrapper}>
                <Animated.View
                  style={[
                    styles.celebrationGlow,
                    {
                      backgroundColor: milestoneTheme.accent,
                      opacity: glowOpacity,
                      transform: [{ scale: glowScale }],
                    },
                  ]}
                />

                <Svg
                  width={RING_SIZE}
                  height={RING_SIZE}
                  style={styles.svgRing}
                >
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    stroke={milestoneTheme.accent + '22'}
                    strokeWidth={RING_STROKE}
                    fill="transparent"
                  />
                  <AnimatedCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    stroke={milestoneTheme.accent}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    fill="transparent"
                    strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                    strokeDashoffset={ringStrokeDashoffset}
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                  />
                </Svg>

                <Animated.View
                  style={[
                    styles.avatarContainer,
                    { transform: [{ scale: avatarScale }] },
                  ]}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.celebrationEmoji}>{activeAvatar.emoji}</Text>
                  </View>

                  {latestMood && (
                    <View style={[styles.avatarMoodBadge, { backgroundColor: milestoneTheme.accent }]}>
                      <Text style={styles.avatarMoodBadgeText}>{latestMood}</Text>
                    </View>
                  )}
                </Animated.View>

                <Animated.View
                  style={[
                    styles.crownWrapper,
                    { transform: [{ translateY: crownDrop }, { scale: crownPulse }] },
                  ]}
                >
                  <Text style={styles.crownEmoji}>👑</Text>
                </Animated.View>

                <Animated.Text
                  style={[
                    styles.sparkleLeft,
                    {
                      opacity: sparkle1,
                      transform: [{ translateY: sparkle2Y }],
                    },
                  ]}
                >
                  ✨
                </Animated.Text>

                <Animated.Text
                  style={[
                    styles.sparkleRight,
                    {
                      opacity: sparkle2,
                      transform: [
                        {
                          translateY: sparkle2Y.interpolate({
                            inputRange: [-6, 0],
                            outputRange: [6, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
              </View>

              <Text style={[styles.celebrationEyebrow, { color: milestoneTheme.accent }]}>
                {isFinalMilestone ? 'CHALLENGE COMPLETE' : `MILESTONE ${celebration} · COMPLETE`}
              </Text>

              <Text style={styles.celebrationTitle}>
                {isFinalMilestone ? `You finished, ${state.userName}!` : `You did it, ${state.userName}!`}
              </Text>

              <Text style={styles.celebrationSubtitle}>
                {celebrationDays.length} days of {state.habitName} — done
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, { color: milestoneTheme.accent }]}>
                    {celebrationCompleted}
                  </Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{celebrationGrace}</Text>
                  <Text style={styles.statLabel}>Grace used</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>
                    {celebrationMoods.length > 0 ? celebrationMoods[0].mood : '🌱'}
                  </Text>
                  <Text style={styles.statLabel}>Top mood</Text>
                </View>
              </View>

              <Animated.View
                style={[
                  styles.shareCardWrapper,
                  {
                    opacity: cardFade,
                    transform: [{ translateY: cardSlide }],
                  },
                ]}
              >
                <View ref={cardRef} collapsable={false} style={styles.shareCard}>
                  <View style={[styles.shareCardBanner, { backgroundColor: milestoneTheme.accent }]}>
                    <Text style={styles.shareCardBannerText}>
                      {isFinalMilestone ? '🏆  CHALLENGE COMPLETE' : '✓  COMPLETED'}
                    </Text>
                  </View>

                  <View style={styles.shareCardTop}>
                    <Text style={styles.shareCardBrand}>GraceDays</Text>
                    <View style={[styles.shareCardBadge, { backgroundColor: milestoneTheme.accent + '22', borderColor: milestoneTheme.accent }]}>
                      <Text style={[styles.shareCardBadgeText, { color: milestoneTheme.accent }]}>
                        M{celebration}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.shareCardUserRow}>
                    <View style={styles.shareCardAvatarWrapper}>
                      <Text style={styles.shareCardCrown}>👑</Text>
                      <View style={[styles.shareCardAvatar, { backgroundColor: activeAvatar.color + '33', borderColor: activeAvatar.color }]}>
                        <Text style={styles.shareCardAvatarEmoji}>{activeAvatar.emoji}</Text>
                        {latestMood && (
                          <View style={[styles.shareCardAvatarBadge, { backgroundColor: milestoneTheme.accent }]}>
                            <Text style={styles.shareCardAvatarBadgeText}>{latestMood}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={styles.shareCardUserName}>{state.userName}</Text>
                  </View>

                  <Text style={styles.shareCardHabit}>{state.habitName}</Text>
                  <Text style={styles.shareCardRange}>
                    D{(celebration! - 1) * MILESTONE_SIZE + 1} → D
                    {Math.min(celebration! * MILESTONE_SIZE, totalDays)}
                  </Text>

                  <View style={styles.shareCardEmojiRow}>
                    {celebrationDays.map((d) => (
                      <View key={d.day} style={styles.shareCardEmojiCell}>
                        <Text style={styles.shareCardEmojiText}>
                          {d.status === 'completed' && d.mood ? d.mood : '🛡️'}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {finalNote && (
                    <View style={styles.shareCardNoteBox}>
                      <Text style={styles.shareCardNoteText}>"{finalNote}"</Text>
                    </View>
                  )}

                  <View style={[styles.shareCardFooter, { backgroundColor: milestoneTheme.accent + '22', borderColor: milestoneTheme.accent + '55' }]}>
                    <Text style={[styles.shareCardFooterText, { color: milestoneTheme.accent }]}>
                      🌱 {celebrationCompleted}/10 days · {celebrationGrace} grace
                    </Text>
                  </View>
                  <Text style={styles.shareCardDate}>
                    {todayISO()} · Keep going! 🚀
                  </Text>
                </View>
              </Animated.View>

              <View style={styles.celebrationButtons}>
                <TouchableOpacity
                  style={[styles.shareButton, { backgroundColor: milestoneTheme.accent }]}
                  onPress={handleShare}
                >
                  <Text style={styles.shareButtonText}>📤  Share Progress</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                  <Text style={styles.continueButtonText}>Continue Streak  →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1412' },
  loadingContainer: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 60 },

  setupContainer: { flex: 1, backgroundColor: '#0F1412' },
  setupScroll: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  setupBrand: { color: '#7DD3C0', fontSize: 14, fontWeight: '700', letterSpacing: 2, textAlign: 'center', marginBottom: 40 },
  setupTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  setupSubtitle: { color: '#8A9A94', fontSize: 15, textAlign: 'center', marginBottom: 32 },
  input: { backgroundColor: '#16211D', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18, color: '#FFFFFF', fontSize: 18, borderWidth: 1.5, borderColor: '#24332E', marginBottom: 24 },
  nextButton: { backgroundColor: '#7DD3C0', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  nextButtonDisabled: { opacity: 0.3 },
  nextButtonText: { color: '#0F1412', fontSize: 16, fontWeight: '700' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  avatarOption: { width: '22%', aspectRatio: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 12 },
  avatarEmoji: { fontSize: 32 },
  setupOptions: { gap: 14 },
  setupOption: { backgroundColor: '#16211D', borderRadius: 20, padding: 22, borderWidth: 1.5, borderColor: '#24332E' },
  setupOptionLabel: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  setupOptionSub: { color: '#8A9A94', fontSize: 13 },
  stepDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 30 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#24332E' },
  stepDotActive: { backgroundColor: '#7DD3C0' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, position: 'relative' },
  miniAvatarEmoji: { fontSize: 22 },
  miniAvatarBadge: { position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0F1412' },
  miniAvatarBadgeText: { fontSize: 10 },
  appName: { color: '#7DD3C0', fontSize: 14, marginBottom: 4 },
  date: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  headerIcons: { flexDirection: 'row', gap: 10 },
  iconButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1A2622', alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },

  card: { backgroundColor: '#16211D', borderRadius: 24, padding: 24, marginBottom: 24 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  habitName: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  activeBadge: { backgroundColor: '#3A2F14', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  activeText: { color: '#F5C542', fontSize: 13, fontWeight: '600' },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 },
  streakNumber: { color: '#FFFFFF', fontSize: 64, fontWeight: '800' },
  streakLabel: { color: '#8A9A94', fontSize: 18, marginLeft: 10 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressText: { color: '#8A9A94', fontSize: 14 },
  progressPercent: { color: '#7DD3C0', fontSize: 14, fontWeight: '700' },
  progressBarBg: { height: 8, backgroundColor: '#24332E', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: '#7DD3C0', borderRadius: 4 },

  resilienceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#24332E' },
  resiliencePill: { backgroundColor: '#1F3028', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  resilienceLabel: { color: '#8A9A94', fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 2 },
  resilienceValue: { color: '#7DD3C0', fontSize: 18, fontWeight: '800' },
  resilienceHint: { color: '#8A9A94', fontSize: 12, flex: 1, lineHeight: 16 },

  milestoneLabel: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  milestoneScroll: { gap: 10, paddingRight: 20, paddingBottom: 20 },
  milestoneTab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1A2622' },
  milestoneTabActive: { backgroundColor: '#7DD3C0' },
  milestoneText: { color: '#8A9A94', fontSize: 15, fontWeight: '600' },
  milestoneTextActive: { color: '#0F1412' },

  sectionLabel: { color: '#8A9A94', fontSize: 14, marginBottom: 14 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  dayCell: { width: '18%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  cellCompleted: { backgroundColor: '#1A2622' },
  cellMissed: { backgroundColor: '#3A1A1A', borderColor: '#E74C3C' },
  cellGrace: { backgroundColor: '#1F1629', borderColor: '#B084D6' },
  cellToday: { backgroundColor: '#2A2413', borderColor: '#F5C542' },
  cellFuture: { backgroundColor: '#141A17', opacity: 0.4 },
  dayEmoji: { fontSize: 22, marginBottom: 2 },
  missedX: { fontSize: 24, marginBottom: 2, color: '#FF6B6B', fontWeight: '900' },
  todayPlus: { fontSize: 22, marginBottom: 2, color: '#F5C542', fontWeight: '900' },
  dayLabel: { color: '#8A9A94', fontSize: 11 },
  noteDot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#8A9A94', fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#16211D', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#2E3B36', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  modalSubtitle: { color: '#8A9A94', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  moodButton: { width: '30%', backgroundColor: '#1A2622', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  moodButtonSelected: { borderColor: '#7DD3C0', backgroundColor: '#1F3028' },
  moodEmoji: { fontSize: 28, marginBottom: 6 },
  moodLabel: { color: '#8A9A94', fontSize: 12, fontWeight: '600' },
  noteInput: { backgroundColor: '#1A2622', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#24332E', marginBottom: 16, minHeight: 50 },
  confirmButton: { backgroundColor: '#7DD3C0', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  confirmButtonText: { color: '#0F1412', fontSize: 16, fontWeight: '700' },
  cancelButton: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#8A9A94', fontSize: 15, fontWeight: '600' },

  noteViewerSheet: { backgroundColor: '#16211D', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40, alignItems: 'center' },
  noteViewerDay: { color: '#7DD3C0', fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  noteViewerMood: { fontSize: 48, marginBottom: 16 },
  noteViewerReflection: { color: '#B084D6', fontSize: 15, fontStyle: 'italic', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  noteViewerText: { color: '#FFFFFF', fontSize: 17, fontStyle: 'italic', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  noteViewerEmpty: { color: '#5F6F68', fontSize: 15, textAlign: 'center', marginBottom: 24 },

  // Celebration
  celebrationBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  celebrationScroll: { paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center' },
  celebrationContent: { width: '100%', alignItems: 'center' },

  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  celebrationGlow: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
  },
  svgRing: {
    position: 'absolute',
  },
  avatarContainer: {
    width: RING_SIZE - 30,
    height: RING_SIZE - 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarCircle: {
    width: RING_SIZE - 44,
    height: RING_SIZE - 44,
    borderRadius: (RING_SIZE - 44) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1412',
  },
  celebrationEmoji: { fontSize: 56 },
  avatarMoodBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0F1412',
  },
  avatarMoodBadgeText: { fontSize: 16 },

  // Crown sits right on the head
  crownWrapper: {
    position: 'absolute',
    top: 24,
    zIndex: 5,
  },
  crownEmoji: {
    fontSize: 34,
  },
  sparkleLeft: {
    position: 'absolute',
    top: 30,
    left: 14,
    fontSize: 18,
    zIndex: 6,
  },
  sparkleRight: {
    position: 'absolute',
    top: 20,
    right: 18,
    fontSize: 14,
    zIndex: 6,
  },

  celebrationEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 12,
  },
  celebrationTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  celebrationSubtitle: {
    color: '#8A9A94',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#16211D',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginBottom: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#24332E',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { color: '#8A9A94', fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: '#24332E' },

  shareCardWrapper: { width: '100%', marginBottom: 24 },
  shareCard: {
    width: '100%',
    backgroundColor: '#1F2A22',
    borderRadius: 20,
    padding: 20,
    paddingTop: 56,
    borderWidth: 1,
    borderColor: '#3A4A3F',
    overflow: 'hidden',
  },
  shareCardBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    alignItems: 'center',
  },
  shareCardBannerText: {
    color: '#0F1412',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  shareCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  shareCardBrand: { color: '#7DD3C0', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  shareCardBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  shareCardBadgeText: { fontSize: 12, fontWeight: '800' },
  shareCardUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  shareCardAvatarWrapper: { position: 'relative' },
  shareCardCrown: { position: 'absolute', top: -12, left: 11, fontSize: 13, zIndex: 2 },
  shareCardAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, position: 'relative' },
  shareCardAvatarEmoji: { fontSize: 20 },
  shareCardAvatarBadge: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1F2A22' },
  shareCardAvatarBadgeText: { fontSize: 9 },
  shareCardUserName: { color: '#8A9A94', fontSize: 14, fontWeight: '600' },
  shareCardHabit: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  shareCardRange: { color: '#8A9A94', fontSize: 13, marginBottom: 16 },
  shareCardEmojiRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#16211D', borderRadius: 14, padding: 10, marginBottom: 16 },
  shareCardEmojiCell: { alignItems: 'center', justifyContent: 'center' },
  shareCardEmojiText: { fontSize: 20 },
  shareCardNoteBox: { backgroundColor: '#16211D', borderRadius: 12, padding: 12, marginBottom: 16 },
  shareCardNoteText: { color: '#8A9A94', fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  shareCardFooter: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginBottom: 12, borderWidth: 1 },
  shareCardFooterText: { fontSize: 14, fontWeight: '800' },
  shareCardDate: { color: '#5F6F68', fontSize: 11, textAlign: 'center' },

  celebrationButtons: { width: '100%', gap: 12 },
  shareButton: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  shareButtonText: { color: '#0F1412', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  continueButton: { backgroundColor: 'transparent', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#24332E' },
  continueButtonText: { color: '#8A9A94', fontSize: 14, fontWeight: '600' },
});